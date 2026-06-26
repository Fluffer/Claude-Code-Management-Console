/**
 * App shell — assembles all main-window features into the WinUI layout:
 *
 *   ┌─────────────────────────────────────────────┐
 *   ├────────────┬────────────────────────────────┤
 *   │  sidebar   │  [search row]                  │
 *   │  (240px)   │  [project list]                │
 *   │            │  [command bar]                 │
 *   ├────────────┴────────────────────────────────┤
 *   │  status bar                                 │
 *   └─────────────────────────────────────────────┘
 *
 * ActionContext dispatcher (onAction):
 *   Every ProjectAction kind is handled — no silent fall-throughs.
 *   launch-continue / launch-new → launch:run IPC (main resolves shell+WT)
 *   copy-path / copy-deep-link   → navigator.clipboard (renderer-only)
 *   hide                         → config:read + config:write
 *   open-folder / open-claude-md / open-settings-json / open-claudeignore → shell:openPath
 *   open-vscode                  → shell:openInVscode
 *   move-to-root                 → MoveToRootDialog
 *   stop-session                 → sessions:kill (with confirm)
 *   stop-all (CommandBar)        → kill all running sessions
 */
import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ThemeProvider, useTheme, appThemeFromStateString } from './theme/ThemeProvider'
import { ToastProvider, useToast } from './components/ui/Toast'
import { useProjects } from './hooks/useProjects'
import { useRunningSessions } from './hooks/useRunningSessions'
import { useAppState } from './hooks/useAppState'
import { useProjectEnrichment } from './hooks/useProjectEnrichment'
import { useDeepLink } from './hooks/useDeepLink'
import { useClaudeOnPath } from './hooks/useClaudeOnPath'
import { useClaudeVersion } from './hooks/useClaudeVersion'
import { Banner } from './components/ui/Banner'
import { DropOverlay } from './components/DropOverlay'
import { applyAccent, applyFont } from './theme/applyAppearance'
import { buildSidebarItems, type SidebarEntry } from './features/sidebar/sidebarItems'
import { Sidebar } from './features/sidebar/Sidebar'
import { useProjectList } from './features/projects/useProjectList'
import { ProjectList } from './features/projects/ProjectList'
import { CommandBar } from './features/commandbar/CommandBar'
import { CommandPalette } from './features/palette/CommandPalette'
import { DialogsProvider, useDialogs } from './features/dialogs/useDialogs'
import { TextInput } from './components/ui/TextInput'
import { deepLinkBuilder } from '../core/links/deepLinkBuilder'
import { setModel } from '../core/config/flagsEditor'
import { sessionMatchesProject } from '../core/os/sessionMatch'
import type { ProjectAction } from './features/projects/projectActions'
import type { LaunchGroup, LauncherConfig, ProjectInfo, SavedFilter } from '../core/models'

function MainWindow(): React.ReactElement {
  const { projects, loading: projectsLoading, error: projectsError, refresh } = useProjects()
  const { sessions: runningSessions } = useRunningSessions()
  const { state, loading: stateLoading, togglePin, setSortMode, setOnboardingDismissed, reload: reloadState } = useAppState()
  const { enrichments } = useProjectEnrichment(projects)
  const { openDialog, registerRefresh } = useDialogs()
  const { showToast } = useToast()
  const { onPath: claudeOnPath } = useClaudeOnPath()
  const { version: claudeVersion } = useClaudeVersion()
  const { setTheme } = useTheme()

  const [config, setConfig] = useState<LauncherConfig | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedSidebar, setSelectedSidebar] = useState<SidebarEntry | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragCounterRef = useRef(0)

  const reloadConfig = useCallback(() => {
    void window.ccmc.invoke('config:read').then(setConfig)
  }, [])

  // Load config once to get the canonical roots list
  useEffect(() => {
    reloadConfig()
  }, [reloadConfig])

  // Apply saved theme + accent + font whenever state loads or changes (including
  // after Settings save). Without applying the persisted theme here the app would
  // launch in the OS theme and ignore the user's saved choice.
  // Re-runs on cancel too, reverting any un-saved live preview back to the persisted values.
  useEffect(() => {
    if (!state) return
    setTheme(appThemeFromStateString(state.theme))
    applyAccent(state.accent)
    applyFont(state.font)
  }, [state, setTheme])

  // Dialogs report data mutations via onRefresh; re-pull every source the
  // command bar / sidebar / list read from (projects, state.json, config.json).
  useEffect(() => {
    registerRefresh(() => {
      refresh()
      reloadState()
      reloadConfig()
    })
  }, [registerRefresh, refresh, reloadState, reloadConfig])

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Ctrl/Cmd+K or Ctrl/Cmd+P → toggle palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'p')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      // Ctrl/Cmd+N → new project dialog (blocked while typing in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        const tgt = e.target as HTMLElement | null
        const typing = !!tgt && (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement || tgt.isContentEditable)
        if (typing) return
        e.preventDefault()
        openDialog({ kind: 'new-project', roots: config?.roots ?? [] })
      }
      // F5 → refresh (blocked while typing in inputs)
      if (e.key === 'F5') {
        const tgt = e.target as HTMLElement | null
        const typing = !!tgt && (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement || tgt.isContentEditable)
        if (typing) return
        e.preventDefault()
        refresh()
      }
      // F1 → help
      if (e.key === 'F1') {
        e.preventDefault()
        openDialog({ kind: 'help' })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openDialog, config, refresh])

  // Build sidebar from config roots so empty roots still appear
  const sidebarItems = buildSidebarItems(
    config?.roots ?? [],
    projects,
    state?.savedFilters ?? [],
  )

  // Re-sync selected sidebar when items rebuild
  const effectiveSidebar: SidebarEntry =
    (selectedSidebar && sidebarItems.some((i) => i.id === selectedSidebar.id)
      ? selectedSidebar
      : null) ?? sidebarItems[0] ?? null

  const visibleProjects = useProjectList({
    projects,
    selectedSidebar: effectiveSidebar,
    searchText,
    sortMode: state?.sortMode ?? 'LastUsed',
    pinned: state?.pinned ?? [],
    runningSessions,
    enrichments,
  })

  const anySessionRunning = runningSessions.length > 0
  const loading = projectsLoading || stateLoading

  // Recent projects — resolve state.recentLaunches (newest first) to live
  // ProjectInfo rows, dropping any that no longer exist. Mirrors RebuildRecent.
  const recentProjects: ProjectInfo[] = (state?.recentLaunches ?? [])
    .map((p) => projects.find((pr) => pr.path.toLowerCase() === p.toLowerCase()))
    .filter((p): p is ProjectInfo => p != null)

  const onAction = useCallback(
    (action: ProjectAction) => {
      switch (action.kind) {
        // ------------------------------------------------------------------
        // Pin toggle (direct state op)
        // ------------------------------------------------------------------
        case 'pin-toggle':
          togglePin(action.project.path)
          break

        // ------------------------------------------------------------------
        // Launch actions — main process resolves shell + WT via buildLaunchSpec
        // ------------------------------------------------------------------
        case 'launch-continue':
          void window.ccmc
            .invoke('launch:run', {
              projectName: action.project.name,
              projectPath: action.project.path,
              continueSession: true,
              flags: action.project.flags,
            })
            .then((result) => {
              if (!result.ok) {
                showToast(result.error ?? 'Failed to launch session', 'error')
                return
              }
              // Pick up recorded lastUsed + recentLaunches (re-sort + Recent menu).
              refresh()
              reloadState()
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        case 'launch-new':
          void window.ccmc
            .invoke('launch:run', {
              projectName: action.project.name,
              projectPath: action.project.path,
              continueSession: false,
              flags: action.project.flags,
            })
            .then((result) => {
              if (!result.ok) {
                showToast(result.error ?? 'Failed to launch session', 'error')
                return
              }
              refresh()
              reloadState()
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        // ------------------------------------------------------------------
        // Dialog actions
        // ------------------------------------------------------------------
        case 'launch-quick-prompt':
          openDialog({ kind: 'quick-prompt', project: action.project })
          break

        case 'resume-session':
          openDialog({ kind: 'resume-session', project: action.project })
          break

        case 'rename':
          openDialog({ kind: 'rename', project: action.project })
          break

        case 'delete': {
          const enrichment = enrichments[action.project.path] ?? null
          openDialog({
            kind: 'delete',
            project: action.project,
            gitDirty: enrichment?.gitDirty ?? null,
            isRunning: runningSessions.some((s) => sessionMatchesProject(s, action.project)),
          })
          break
        }

        case 'launch-worktree':
          openDialog({ kind: 'pick-worktree', project: action.project })
          break

        case 'edit-env':
          openDialog({ kind: 'edit-env', project: action.project })
          break

        case 'view-mcp':
          openDialog({ kind: 'view-mcp', project: action.project })
          break

        case 'view-skills':
          openDialog({ kind: 'view-skills', project: action.project })
          break

        case 'run-command':
          openDialog({ kind: 'run-command', project: action.project })
          break

        case 'apply-profile':
          openDialog({ kind: 'manage-profiles' })
          break

        case 'move-to-root':
          openDialog({ kind: 'move-to-root', project: action.project })
          break

        case 'duplicate':
          openDialog({
            kind: 'duplicate',
            project: action.project,
            projects,
            roots: config?.roots ?? [],
            defaultRoot: config?.defaultRoot ?? null,
            isGitRepo: (enrichments[action.project.path]?.gitBranch ?? null) != null,
          })
          break

        case 'commit':
          openDialog({ kind: 'commit', project: action.project })
          break

        case 'open-pr':
          openDialog({ kind: 'open-pr', project: action.project })
          break

        // ------------------------------------------------------------------
        // set-model — write --model into the project's saved flags (config.json)
        // Mirrors MainWindow.SetModel_Click → FlagsEditor.SetModel + persist.
        // ------------------------------------------------------------------
        case 'set-model': {
          const projectPath = action.project.path
          void window.ccmc
            .invoke('config:read')
            .then((cfg) => {
              const projects = cfg.projects ?? {}
              const usage = projects[projectPath] ?? { lastUsed: null, flags: '' }
              const nextFlags = setModel(usage.flags, action.model)
              return window.ccmc.invoke('config:write', {
                ...cfg,
                projects: {
                  ...projects,
                  [projectPath]: { ...usage, flags: nextFlags },
                },
              })
            })
            .then(() => refresh())
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break
        }

        // ------------------------------------------------------------------
        // stop-session — confirm + kill the running session for this project
        // ------------------------------------------------------------------
        case 'stop-session': {
          const running = runningSessions.find((s) => sessionMatchesProject(s, action.project))
          if (!running) {
            showToast('No running session found for this project', 'info')
            break
          }
          if (
            window.confirm(
              `Stop the running session for "${action.project.name}"?\nThis will kill PID ${running.pid}.`,
            )
          ) {
            void window.ccmc
              .invoke('sessions:kill', { pid: running.pid })
              .then((result) => {
                if (!result.ok) showToast('Failed to stop session', 'error')
              })
              .catch((err: unknown) => {
                showToast(err instanceof Error ? err.message : String(err), 'error')
              })
          }
          break
        }

        // ------------------------------------------------------------------
        // hide — add to config.hidden[]
        // ------------------------------------------------------------------
        case 'hide':
          void window.ccmc
            .invoke('config:read')
            .then((cfg) => {
              const hidden = cfg.hidden ?? []
              const projectPath = action.project.path
              if (!hidden.some((h) => h.toLowerCase() === projectPath.toLowerCase())) {
                return window.ccmc.invoke('config:write', {
                  ...cfg,
                  hidden: [...hidden, projectPath],
                })
              }
            })
            .then(() => refresh())
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        // ------------------------------------------------------------------
        // copy-path — renderer clipboard, no IPC needed
        // ------------------------------------------------------------------
        case 'copy-path':
          void navigator.clipboard
            .writeText(action.project.path)
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        // ------------------------------------------------------------------
        // copy-deep-link — build via core deepLinkBuilder, then clipboard
        // ------------------------------------------------------------------
        case 'copy-deep-link': {
          const link = deepLinkBuilder.build(action.project.name)
          void navigator.clipboard.writeText(link).catch((err: unknown) => {
            showToast(err instanceof Error ? err.message : String(err), 'error')
          })
          break
        }

        // ------------------------------------------------------------------
        // open-folder — open project directory in Explorer/Finder
        // ------------------------------------------------------------------
        case 'open-folder':
          void window.ccmc
            .invoke('shell:openPath', { path: action.project.path })
            .then((result) => {
              if (!result.ok) showToast(result.error ?? 'Failed to open folder', 'error')
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        // ------------------------------------------------------------------
        // open-vscode — spawn `code <path>`
        // ------------------------------------------------------------------
        case 'open-vscode':
          void window.ccmc
            .invoke('shell:openInVscode', { path: action.project.path })
            .then((result) => {
              if (!result.ok) showToast(result.error ?? 'Failed to open VS Code', 'error')
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        // ------------------------------------------------------------------
        // open-claude-md — open CLAUDE.md (or claude.md) in default app
        // ------------------------------------------------------------------
        case 'open-claude-md':
          void window.ccmc
            .invoke('projects:claudeInfo', { path: action.project.path })
            .then((info) => {
              if (!info.claudeMdFilename) {
                showToast('No CLAUDE.md file found in this project', 'info')
                return
              }
              const filePath = action.project.path + '\\' + info.claudeMdFilename
              return window.ccmc
                .invoke('shell:openPath', { path: filePath })
                .then((result) => {
                  if (!result.ok) showToast(result.error ?? 'Failed to open CLAUDE.md', 'error')
                })
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break

        // ------------------------------------------------------------------
        // open-settings-json — open <project>/.claude/settings.json
        // ------------------------------------------------------------------
        case 'open-settings-json': {
          const settingsPath = action.project.path + '\\.claude\\settings.json'
          void window.ccmc
            .invoke('shell:openPath', { path: settingsPath })
            .then((result) => {
              if (!result.ok)
                showToast(
                  result.error
                    ? `settings.json: ${result.error}`
                    : 'Failed to open settings.json',
                  'error',
                )
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break
        }

        // ------------------------------------------------------------------
        // open-claudeignore — open <project>/.claudeignore
        // ------------------------------------------------------------------
        case 'open-claudeignore': {
          const ignorePath = action.project.path + '\\.claudeignore'
          void window.ccmc
            .invoke('shell:openPath', { path: ignorePath })
            .then((result) => {
              if (!result.ok)
                showToast(
                  result.error
                    ? `.claudeignore: ${result.error}`
                    : 'Failed to open .claudeignore',
                  'error',
                )
            })
            .catch((err: unknown) => {
              showToast(err instanceof Error ? err.message : String(err), 'error')
            })
          break
        }

        default: {
          // Exhaustiveness guard — TypeScript should make this unreachable
          const _exhaustive: never = action
          showToast(`Unhandled action: ${(_exhaustive as ProjectAction).kind}`, 'error')
          break
        }
      }
    },
    [togglePin, openDialog, enrichments, runningSessions, refresh, reloadState, showToast, config, projects],
  )

  useDeepLink({
    projects,
    onAction,
    onUnresolved: (m) => showToast(m, 'error'),
  })

  useEffect(() => {
    const unsub = window.ccmc.on('event:openPalette', () => {
      setPaletteOpen(true)
    })
    return unsub
  }, [])

  useEffect(() => {
    void window.ccmc.invoke('app:rendererReady')
  }, [])

  function handlePaletteSelect(project: ProjectInfo, isNew: boolean): void {
    onAction(isNew ? { kind: 'launch-new', project } : { kind: 'launch-continue', project })
  }

  // Launch every project in a saved group (fresh sessions, in listed order).
  // Mirrors MainViewModel group launch; worktree-style recordUsage handling N/A here.
  function handleLaunchGroup(group: LaunchGroup): void {
    for (const path of group.projectPaths) {
      const proj = projects.find((p) => p.path.toLowerCase() === path.toLowerCase())
      const name = proj?.name ?? path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
      void window.ccmc
        .invoke('launch:run', {
          projectName: name,
          projectPath: path,
          continueSession: false,
          flags: proj?.flags ?? '',
        })
        .then((result) => {
          if (!result.ok) showToast(result.error ?? `Failed to launch ${name}`, 'error')
        })
        .catch((err: unknown) => {
          showToast(err instanceof Error ? err.message : String(err), 'error')
        })
    }
  }

  // Selecting a saved filter narrows the list — same as picking its sidebar entry.
  function handleSelectFilter(filter: SavedFilter): void {
    const entry = sidebarItems.find((i) => i.id === `filter:${filter.name}`)
    if (entry) setSelectedSidebar(entry)
  }

  function handleStopAll(): void {
    if (
      !window.confirm(
        `Stop all ${runningSessions.length} running session${runningSessions.length !== 1 ? 's' : ''}?`,
      )
    ) {
      return
    }
    for (const session of runningSessions) {
      void window.ccmc
        .invoke('sessions:kill', { pid: session.pid })
        .catch((err: unknown) => {
          showToast(err instanceof Error ? err.message : String(err), 'error')
        })
    }
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    dragCounterRef.current++
    setDragging(true)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setDragging(false)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) {
      showToast('Nothing added — drop a folder', 'info')
      return
    }

    void (async () => {
      const paths = files.map((f) => window.ccmc.pathForFile(f))
      const results = await Promise.all(
        paths.map((p) => window.ccmc.invoke('fs:isDirectory', { path: p })),
      )
      const dirs = paths.filter((_, i) => results[i].ok)

      if (dirs.length === 0) {
        showToast('Ignored non-folder — drop a folder to add it as a source root', 'info')
        return
      }

      const { added } = await window.ccmc.invoke('config:addRoots', { paths: dirs })

      if (added === 0) {
        showToast('Nothing added — already present or not a folder', 'info')
        return
      }

      refresh()
      reloadConfig()
      showToast(`Added ${added} source root${added !== 1 ? 's' : ''}`, 'info')
    })().catch((err: unknown) => {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    })
  }

  return (
    <div
      className="relative flex flex-col h-screen bg-[var(--surface)] text-[var(--text-primary)] font-ui select-none overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DropOverlay show={dragging} />
      {/* Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — 240px matching WinUI ColumnDefinition Width="240" */}
        <aside
          className="flex flex-col w-60 border-r border-[var(--divider)] px-3 py-2 flex-shrink-0"
          aria-label="Sidebar"
        >
          <Sidebar
            items={sidebarItems}
            selected={effectiveSidebar}
            onSelect={setSelectedSidebar}
            onSettingsClick={() => {
              openDialog({ kind: 'settings' })
            }}
            onHelpClick={() => {
              openDialog({ kind: 'help' })
            }}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden px-3 py-2">
          {/* Banners — WinUI row 0 (warning) then row 1 (info) */}
          {!claudeOnPath && (
            <div className="mb-2">
              <Banner
                severity="warning"
                message="'claude' was not found on PATH. Sessions will open a terminal, but the claude command will fail. Install Claude Code or fix PATH, then press Refresh (F5)."
              />
            </div>
          )}
          {state != null && !state.onboardingDismissed && (
            <div className="mb-2">
              <Banner
                severity="info"
                title="Welcome to Claude Code Management Console!"
                message="Pick a project and press Enter to continue its last Claude session, or Ctrl+Enter for a fresh one. Filter by folder on the left, search with Ctrl+F, pin favourites with the star, open the palette with Ctrl+K / Ctrl+P, and press F1 anytime for the full guide."
                actionLabel="Open guide"
                onAction={() => openDialog({ kind: 'help' })}
                onClose={setOnboardingDismissed}
              />
            </div>
          )}
          {/* Search row */}
          <div className="flex gap-2 mb-2">
            <TextInput
              value={searchText}
              onChange={setSearchText}
              placeholder="Search projects   (Ctrl+F)"
              aria-label="Search projects"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Escape') setSearchText('')
              }}
            />
            <select
              aria-label="Sort projects"
              title="Change how the project list is ordered. Pinned projects always stay on top."
              value={state?.sortMode ?? 'LastUsed'}
              onChange={(e) => setSortMode(e.target.value)}
              className="flex-shrink-0 rounded border border-[var(--control-border)] bg-[var(--control-fill)] text-[var(--text-primary)] text-sm px-2"
            >
              <option value="LastUsed">Sort: Recently used</option>
              <option value="Name">Sort: Name A–Z</option>
            </select>
          </div>

          {/* Project list */}
          <ProjectList
            projects={visibleProjects}
            loading={loading}
            error={projectsError}
            searchText={searchText}
            runningSessions={runningSessions}
            pinnedPaths={state?.pinned ?? []}
            enrichments={enrichments}
            onAction={onAction}
            onRetry={refresh}
          />

          {/* Command bar */}
          <CommandBar
            anySessionRunning={anySessionRunning}
            groups={state?.groups ?? []}
            savedFilters={state?.savedFilters ?? []}
            recent={recentProjects}
            onSelectRecent={(project) => onAction({ kind: 'launch-continue', project })}
            onNewProject={() => {
              openDialog({ kind: 'new-project', roots: config?.roots ?? [] })
            }}
            onCloneRepo={() => {
              openDialog({ kind: 'clone', roots: config?.roots ?? [], defaultRoot: config?.defaultRoot ?? null })
            }}
            onRefresh={refresh}
            onStopAll={handleStopAll}
            onManageProfiles={() => openDialog({ kind: 'manage-profiles' })}
            onLaunchGroup={handleLaunchGroup}
            onManageGroups={() => openDialog({ kind: 'manage-groups', projects })}
            onSelectFilter={handleSelectFilter}
            onManageFilters={() => openDialog({ kind: 'manage-filters' })}
          />
        </main>
      </div>

      {/* Status bar */}
      <footer className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--divider)] text-xs text-[var(--text-secondary)] flex-shrink-0">
        <span>
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
        {anySessionRunning && (
          <span className="text-green-500">
            · {runningSessions.length} live session
            {runningSessions.length !== 1 ? 's' : ''}
          </span>
        )}
        {claudeVersion != null && (
          <span>· Claude v{claudeVersion}</span>
        )}
        <span className="ml-auto opacity-60">
          Enter = Continue · Ctrl+Enter = New · Ctrl+F = Search · Ctrl+K / Ctrl+P = Palette · F1 = Help
        </span>
      </footer>

      {/* Command palette overlay */}
      <CommandPalette
        open={paletteOpen}
        projects={projects}
        onClose={() => setPaletteOpen(false)}
        onSelectProject={handlePaletteSelect}
      />
    </div>
  )
}

export default function App(): React.ReactElement {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DialogsProvider onRefresh={() => { /* DialogsProvider calls refresh via openDialog callers */ }}>
          <MainWindow />
        </DialogsProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}
