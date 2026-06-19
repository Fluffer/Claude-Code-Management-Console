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
 *   launch-continue / launch-new / stop-session → placeholder (batch 4M)
 *   dialog actions (rename, delete, hide, …) → placeholder (batches 4M/4N)
 */
import React, { useState, useCallback, useEffect } from 'react'
import { ThemeProvider } from './theme/ThemeProvider'
import { useProjects } from './hooks/useProjects'
import { useRunningSessions } from './hooks/useRunningSessions'
import { useAppState } from './hooks/useAppState'
import { buildSidebarItems, type SidebarEntry } from './features/sidebar/sidebarItems'
import { Sidebar } from './features/sidebar/Sidebar'
import { useProjectList } from './features/projects/useProjectList'
import { ProjectList } from './features/projects/ProjectList'
import { CommandBar } from './features/commandbar/CommandBar'
import { TextInput } from './components/ui/TextInput'
import type { ProjectAction } from './features/projects/projectActions'
import type { LauncherConfig } from '../core/models'

function MainWindow(): React.ReactElement {
  const { projects, loading: projectsLoading, error: projectsError, refresh } = useProjects()
  const { sessions: runningSessions } = useRunningSessions()
  const { state, loading: stateLoading, togglePin } = useAppState()

  const [config, setConfig] = useState<LauncherConfig | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedSidebar, setSelectedSidebar] = useState<SidebarEntry | null>(null)

  // Load config once to get the canonical roots list (includes roots with 0 projects).
  // Mirrors _config.Roots iteration in RebuildSidebar — config roots, not derived from scanned projects.
  useEffect(() => {
    void window.ccmc.invoke('config:read').then(setConfig)
  }, [])

  // Build sidebar from config roots so empty roots still appear
  const sidebarItems = buildSidebarItems(
    config?.roots ?? [],
    projects,
    state?.savedFilters ?? [],
  )

  // Re-sync selected sidebar when items rebuild (mirror SelectedSidebarItem re-selection logic in RebuildSidebar)
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
          // Direct state op — mirrors TogglePin relaycommand
          togglePin(action.project.path)
          break
        // Launch / session actions — IPC wired in batch 4M
        case 'launch-continue':
        case 'launch-new':
        case 'launch-quick-prompt':
        case 'launch-worktree':
        case 'resume-session':
        case 'stop-session':
          break
        // Dialog actions — batches 4M/4N register handlers
        default:
          break
      }
    },
    [togglePin],
  )

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
              /* settings dialog — batch 4M */
            }}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden px-3 py-2">
          {/* Search row — mirrors TextBox SearchBox in XAML (Ctrl+F focus, Esc clear) */}
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
            onAction={onAction}
            onRetry={refresh}
          />

          {/* Command bar */}
          <CommandBar
            anySessionRunning={anySessionRunning}
            onNewProject={() => {
              /* new-project dialog — batch 4M */
            }}
            onRefresh={refresh}
            onStopAll={() => {
              /* confirm + kill all — batch 4M */
            }}
          />
        </main>
      </div>

      {/* Status bar — mirrors WinUI Grid.Row="3" status border */}
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
          Enter = Continue · Ctrl+Enter = New · Ctrl+F = Search · F1 = Help
        </span>
      </footer>
    </div>
  )
}

export default function App(): React.ReactElement {
  return (
    <ThemeProvider>
      <MainWindow />
    </ThemeProvider>
  )
}
