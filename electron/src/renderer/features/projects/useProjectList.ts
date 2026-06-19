import { useMemo } from 'react'
import type { ProjectInfo, RunningSession, SavedFilter } from '../../../core/models'
import type { SidebarEntry } from '../sidebar/sidebarItems'
import { projectMatches } from '../../../core/projects/projectSearch'
import { filterMatches, type ProjectFacts } from '../../../core/projects/projectFilter'

export interface UseProjectListInput {
  projects: ProjectInfo[]
  selectedSidebar: SidebarEntry | null
  searchText: string
  sortMode: string
  pinned: string[]
  runningSessions: RunningSession[]
}

/**
 * Pure derived list — mirrors MainViewModel.ApplyFilter.
 *
 * Filter pipeline (AND semantics, mirrors C# LINQ chain):
 *   1. Root filter  — selectedSidebar.root non-null → filter by project.root
 *   2. Search text  — projectMatches() from core (case-insensitive substring on name/description)
 *   3. Saved filter — filterMatches() from core (AND of each condition)
 *   4. Sort         — pinned first, then by sortMode ("LastUsed" | "Name")
 *
 * hasGit and hasClaudeMd in ProjectFacts default to false here because enrichment
 * (git:info, project:claudeInfo) is async and not yet wired in this batch.
 * SavedFilters that use requireGit/requireClaudeMd will be fully accurate once
 * enrichment state is threaded in (future batch). RequireRunning uses the live
 * runningSessions list which IS available synchronously.
 *
 * Sort order mirrors MainViewModel exactly:
 *   - sortMode "Name"     → pinned desc → name asc (case-insensitive)
 *   - sortMode "LastUsed" → pinned desc → lastUsedUtc desc → name asc (nulls last)
 */
export function useProjectList(input: UseProjectListInput): ProjectInfo[] {
  const { projects, selectedSidebar, searchText, sortMode, pinned, runningSessions } = input

  return useMemo(() => {
    const pinnedSet = new Set(pinned.map((p) => p.toLowerCase()))
    const runningDirs = new Set(runningSessions.map((s) => s.workingDirectory.toLowerCase()))

    let filtered: ProjectInfo[] = projects

    // 1. Root filter
    if (selectedSidebar?.root) {
      const root = selectedSidebar.root.toLowerCase()
      filtered = filtered.filter((p) => p.root.toLowerCase() === root)
    }

    // 2. Search text
    const term = searchText.trim()
    if (term) {
      filtered = filtered.filter((p) => projectMatches(p, term))
    }

    // 3. Saved filter (AND semantics; unset conditions pass)
    const activeFilter: SavedFilter | null = selectedSidebar?.filter ?? null
    if (activeFilter) {
      filtered = filtered.filter((p) => {
        const facts: ProjectFacts = {
          path: p.path,
          hasGit: false,       // enrichment-only — not yet available synchronously
          hasClaudeMd: false,  // enrichment-only
          isRunning: runningDirs.has(p.path.toLowerCase()),
          isPinned: pinnedSet.has(p.path.toLowerCase()),
        }
        return filterMatches(activeFilter, facts)
      })
    }

    // 4. Sort — pinned always first, then by mode
    const sorted = [...filtered].sort((a, b) => {
      const aPinned = pinnedSet.has(a.path.toLowerCase())
      const bPinned = pinnedSet.has(b.path.toLowerCase())
      if (aPinned !== bPinned) return bPinned ? 1 : -1

      if (sortMode === 'Name') {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      }

      // LastUsed descending; null sorts last; tie-break by name asc
      const aTime = a.lastUsedUtc ? new Date(a.lastUsedUtc).getTime() : -Infinity
      const bTime = b.lastUsedUtc ? new Date(b.lastUsedUtc).getTime() : -Infinity
      if (bTime !== aTime) return bTime - aTime
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })

    return sorted
  }, [projects, selectedSidebar, searchText, sortMode, pinned, runningSessions])
}
