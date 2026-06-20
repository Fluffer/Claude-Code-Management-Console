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
import React, { useState, useCallback, useEffect } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
import { ToastProvider, useToast } from './components/ui/Toast'
import { useProjects } from './hooks/useProjects'
import { useRunningSessions } from './hooks/useRunningSessions'
import { useAppState } from './hooks/useAppState'
import { useProjectEnrichment } from './hooks/useProjectEnrichment'
import { buildSidebarItems, type SidebarEntry } from './features/sidebar/sidebarItems'
import { Sidebar } from './features/sidebar/Sidebar'
import { useProjectList } from './features/projects/useProjectList'
import { ProjectList } from './features/projects/ProjectList'
import { CommandBar } from './features/commandbar/CommandBar'
import { CommandPalette } from './features/palette/CommandPalette'
import { DialogsProvider, useDialogs } from './features/dialogs/useDialogs'
import { TextInput } from './components/ui/TextInput'
import { deepLinkBuilder } from '../core/links/deepLinkBuilder'
import type { ProjectAction } from './features/projects/projectActions'
import type { LauncherConfig, ProjectInfo } from '../core/models'

function MainWindow(): React.ReactElement {
  const { projects, loading: projectsLoading, error: projectsError, refresh } = useProjects()
  const { sessions: runningSessions } = useRunningSessions()
  const { state, loading: stateLoading, togglePin } = useAppState()
  const { enrichments } = useProjectEnrichment(projects)
  const { openDialog } = useDialogs()
  const { showToast } = useToast()

  const [config, setConfig] = useState<LauncherConfig | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedSidebar, setSelectedSidebar] = useState<SidebarEntry | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Load config once to get the canonical roots list
  useEffect(() => {
    void window.ccmc.invoke('config:read').then(setConfig)
  }, [])

  // Ctrl+K / Cmd+K opens command palette; F1 opens help
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (e.key === 'F1') {
        e.preventDefault()
        openDialog({ kind: 'help' })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openDialog])

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
  })

  const anySessionRunning = runningSessions.length > 0
  const loading = projectsLoading || stateLoading

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
              }
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
              }
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
            isRunning: runningSessions.some(
              (s) => s.workingDirectory.toLowerCase() === action.project.path.toLowerCase(),
            ),
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

        case 'apply-profile':
          openDialog({ kind: 'manage-profiles' })
          break

        case 'move-to-root':
          openDialog({ kind: 'move-to-root', project: action.project })
          break

        // ------------------------------------------------------------------
        // stop-session — confirm + kill the running session for this project
        // ------------------------------------------------------------------
        case 'stop-session': {
          const running = runningSessions.find(
            (s) => s.workingDirectory.toLowerCase() === action.project.path.toLowerCase(),
          )
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
    [togglePin, openDialog, enrichments, runningSessions, refresh, showToast],
  )

  function handlePaletteSelect(project: ProjectInfo, isNew: boolean): void {
    onAction(isNew ? { kind: 'launch-new', project } : { kind: 'launch-continue', project })
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

  return (
    <div className="flex flex-col h-screen bg-[var(--surface)] text-[var(--text-primary)] font-ui select-none overflow-hidden">
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
            onNewProject={() => {
              openDialog({ kind: 'new-project', roots: config?.roots ?? [] })
            }}
            onRefresh={refresh}
            onStopAll={handleStopAll}
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
        <span className="ml-auto opacity-60">
          Enter = Continue · Ctrl+Enter = New · Ctrl+F = Search · Ctrl+K = Palette · F1 = Help
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
