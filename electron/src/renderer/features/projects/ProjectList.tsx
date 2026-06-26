import React, { useState, useCallback, useRef, useLayoutEffect } from 'react'
import { Spinner } from '../../components/ui/Spinner'
import { Button } from '../../components/ui/Button'
import { ProjectRow } from './ProjectRow'
import { ContextMenu } from './ContextMenu'
import type { ProjectInfo, RunningSession } from '../../../core/models'
import { sessionMatchesProject } from '../../../core/os/sessionMatch'
import type { ProjectAction } from './projectActions'
import type { ProjectEnrichment } from './ProjectRow'

interface ProjectListProps {
  projects: ProjectInfo[]
  loading: boolean
  error: string | null
  searchText: string
  runningSessions: RunningSession[]
  pinnedPaths: string[]
  enrichments?: Record<string, ProjectEnrichment>
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
 * Running badge: a project is live when a running session maps to it via
 * sessionMatchesProject (working directory when known, else the launcher's
 * `-n <project name>`) — Windows cannot read a process working directory.
 */
export function ProjectList({
  projects,
  loading,
  error,
  searchText,
  runningSessions,
  pinnedPaths,
  enrichments = {},
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

  const pinnedSet = new Set(pinnedPaths.map((p) => p.toLowerCase()))

  return (
    <div
      className="flex-1 overflow-y-auto"
      onClick={closeContextMenu}
      onKeyDown={(e) => { if (e.key === 'Escape') closeContextMenu() }}
    >
      {projects.map((project) => {
        const isRunning = runningSessions.some((s) => sessionMatchesProject(s, project))
        return (
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
            isRunning={isRunning}
            isPinned={pinnedSet.has(project.path.toLowerCase())}
            enrichment={enrichments[project.path] ?? null}
            onAction={onAction}
          />
          {contextMenuProject?.path === project.path && contextMenuPos && (
            <PositionedMenu x={contextMenuPos.x} y={contextMenuPos.y}>
              <ContextMenu
                project={project}
                isOpen={true}
                isRunning={isRunning}
                enrichment={enrichments[project.path] ?? null}
                onClose={closeContextMenu}
                onAction={onAction}
              />
            </PositionedMenu>
          )}
        </div>
        )
      })}
    </div>
  )
}

/**
 * Fixed-position wrapper for the row context menu that keeps the menu fully
 * inside the viewport. The raw cursor coords (clientX/Y) clip the menu when the
 * row is near the bottom/right edge, so after first layout we measure the menu
 * and shift it back in-bounds (flip up / nudge left). If the menu is taller than
 * the viewport, it caps its height and scrolls instead of overflowing.
 */
function PositionedMenu({
  x,
  y,
  children,
}: {
  x: number
  y: number
  children: React.ReactNode
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const rect = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - rect.height - margin)
    }
    setPos({ left, top })
  }, [x, y])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 50,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  )
}
