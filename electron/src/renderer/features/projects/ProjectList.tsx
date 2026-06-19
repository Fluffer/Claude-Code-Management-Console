import React, { useState, useCallback } from 'react'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { ProjectRow } from './ProjectRow'
import { ContextMenu } from './ContextMenu'
import type { ProjectInfo, RunningSession } from '../../../core/models'
import type { ProjectAction } from './projectActions'

interface ProjectListProps {
  projects: ProjectInfo[]
  loading: boolean
  error: string | null
  searchText: string
  runningSessions: RunningSession[]
  pinnedPaths: string[]
  onAction: (action: ProjectAction) => void
  onRetry: () => void
}

/**
 * Renders the filtered+sorted project list with loading/error/empty states.
 *
 * Empty state text mirrors MainViewModel.ComputeEmptyStateText():
 *   - searchText set     → "No projects match…"  (search returned nothing)
 *   - searchText empty   → "No projects found…"  (no projects at all)
 *
 * Running badge: a project is live if its path (case-insensitive) is in
 * runningSessions[].workingDirectory — mirrors RunningClaudeDetector.IsProjectRunning().
 */
export function ProjectList({
  projects,
  loading,
  error,
  searchText,
  runningSessions,
  pinnedPaths,
  onAction,
  onRetry,
}: ProjectListProps): React.ReactElement {
  const [contextMenuProject, setContextMenuProject] = useState<ProjectInfo | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  const closeContextMenu = useCallback(() => {
    setContextMenuProject(null)
    setContextMenuPos(null)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" label="Loading projects…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[var(--text-secondary)]">
        <p>{error}</p>
        <Button onClick={onRetry} aria-label="Retry loading projects">
          Retry
        </Button>
      </div>
    )
  }

  if (projects.length === 0) {
    const emptyText = searchText.trim()
      ? `No projects match "${searchText.trim()}". Press Esc to clear the search.`
      : 'No projects found. Create one with "+ New Project", or drop a folder onto this window.'

    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-sm text-[var(--text-secondary)] text-center max-w-sm opacity-70">
          {emptyText}
        </p>
      </div>
    )
  }

  const runningSet = new Set(runningSessions.map((s) => s.workingDirectory.toLowerCase()))
  const pinnedSet = new Set(pinnedPaths.map((p) => p.toLowerCase()))

  return (
    <div
      className="flex-1 overflow-y-auto"
      onClick={closeContextMenu}
      onKeyDown={(e) => { if (e.key === 'Escape') closeContextMenu() }}
    >
      {projects.map((project) => (
        <div
          key={project.path}
          className="relative"
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenuProject(project)
            setContextMenuPos({ x: e.clientX, y: e.clientY })
          }}
        >
          <ProjectRow
            project={project}
            isRunning={runningSet.has(project.path.toLowerCase())}
            isPinned={pinnedSet.has(project.path.toLowerCase())}
            enrichment={null}
            onAction={onAction}
          />
          {contextMenuProject?.path === project.path && contextMenuPos && (
            <div
              style={{
                position: 'fixed',
                left: contextMenuPos.x,
                top: contextMenuPos.y,
                zIndex: 50,
              }}
            >
              <ContextMenu
                project={project}
                isOpen={true}
                onClose={closeContextMenu}
                onAction={onAction}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
