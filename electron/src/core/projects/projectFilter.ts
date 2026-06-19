import type { SavedFilter } from '../models'

/** A snapshot of the facts a SavedFilter tests. The VM fills this from its rows. */
export interface ProjectFacts {
  path: string
  hasGit: boolean
  hasClaudeMd: boolean
  isRunning: boolean
  isPinned: boolean
}

/** Pure evaluation of a SavedFilter against ProjectFacts. AND semantics; unset = pass. */
export function filterMatches(filter: SavedFilter, facts: ProjectFacts): boolean {
  if (
    filter.pathContains &&
    filter.pathContains.trim() !== '' &&
    !facts.path.toLowerCase().includes(filter.pathContains.toLowerCase())
  ) {
    return false
  }
  if (filter.requireGit && !facts.hasGit) return false
  if (filter.requireClaudeMd && !facts.hasClaudeMd) return false
  if (filter.requireRunning && !facts.isRunning) return false
  if (filter.requirePinned && !facts.isPinned) return false
  return true
}
