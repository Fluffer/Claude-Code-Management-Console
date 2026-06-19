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
 *   pin-toggle → useAppState.togglePin (direct state op)
 *   launch-continue / launch-new → launch:run IPC
 *   rename / delete / quick-prompt / resume-session → DialogsProvider.openDialog
 */
import React, { useState, useCallback, useEffect } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
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
import type { ProjectAction } from './features/projects/projectActions'
import type { LauncherConfig, ProjectInfo } from '../core/models'

interface MainWindowProps {
  onRefresh: () => void
}

function MainWindow({ onRefresh }: MainWindowProps): React.ReactElement {
  const { projects, loading: projectsLoading, error: projectsError, refresh } = useProjects()
  const { sessions: runningSessions } = useRunningSessions()
  const { state, loading: stateLoading, togglePin } = useAppState()
  const { enrichments } = useProjectEnrichment(projects)
  const { openDialog } = useDialogs()

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

  // Notify DialogsProvider of latest refresh function
  useEffect(() => {
    onRefresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        case 'pin-toggle':
          togglePin(action.project.path)
          break

        case 'launch-continue':
          void window.ccmc.invoke('launch:run', {
            filePath: 'claude',
            arguments: '--continue',
            workingDirectory: action.project.path,
          })
          break

        case 'launch-new':
          void window.ccmc.invoke('launch:run', {
            filePath: 'claude',
            arguments: '',
            workingDirectory: action.project.path,
          })
          break

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

        case 'stop-session':
          // TODO: confirm + kill session (sessions:kill IPC) — future batch
          break

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

        default:
          break
      }
    },
    [togglePin, openDialog, enrichments, runningSessions],
  )

  function handlePaletteSelect(project: ProjectInfo, isNew: boolean): void {
    onAction(isNew ? { kind: 'launch-new', project } : { kind: 'launch-continue', project })
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
            onStopAll={() => {
              /* confirm + kill all — batch 4N */
            }}
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
  // Provide a stable refresh callback to DialogsProvider; MainWindow also calls its own refresh.
  // The ref pattern avoids double-mounting useProjects.
  const refreshRef = React.useRef<() => void>(() => {})

  function registerRefresh(fn: () => void): void {
    refreshRef.current = fn
  }

  return (
    <ThemeProvider>
      <DialogsProvider onRefresh={() => refreshRef.current()}>
        <MainWindowWithRefresh onRegisterRefresh={registerRefresh} />
      </DialogsProvider>
    </ThemeProvider>
  )
}

function MainWindowWithRefresh({
  onRegisterRefresh,
}: {
  onRegisterRefresh: (fn: () => void) => void
}): React.ReactElement {
  const { refresh } = useProjects()

  useEffect(() => {
    onRegisterRefresh(refresh)
  }, [refresh, onRegisterRefresh])

  return <MainWindow onRefresh={refresh} />
}
