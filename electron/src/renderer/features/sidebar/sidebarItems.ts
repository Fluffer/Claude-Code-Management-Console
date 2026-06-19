import type { ProjectInfo, SavedFilter } from '../../../core/models'

export interface SidebarEntry {
  id: string
  displayName: string
  root: string | null
  filter: SavedFilter | null
  tooltip: string
}

function leafName(root: string): string {
  const trimmed = root.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

/**
 * Pure function mirroring MainViewModel.RebuildSidebar.
 * Returns:
 *   [0]     "All (N)" entry (root=null, filter=null)
 *   [1..k]  one entry per root with per-root project count
 *   [k+1..] one entry per saved filter (root=null, filter set)
 *
 * Three entry types mirror SidebarItemViewModel:
 *   Root filter  → root non-null
 *   "All" entry  → both null
 *   Saved filter → filter non-null
 */
export function buildSidebarItems(
  roots: string[],
  projects: ProjectInfo[],
  savedFilters: SavedFilter[],
): SidebarEntry[] {
  const items: SidebarEntry[] = []

  // "All" entry — mirrors SidebarItems.Add(new SidebarItemViewModel($"All ({_allProjects.Count})", null, true, ...))
  items.push({
    id: '__all__',
    displayName: `All (${projects.length})`,
    root: null,
    filter: null,
    tooltip: 'Show projects from every source root',
  })

  // Root entries — mirrors foreach (var root in _config.Roots ?? [])
  for (const root of roots) {
    const count = projects.filter((p) => p.root.toLowerCase() === root.toLowerCase()).length
    const leaf = leafName(root)
    items.push({
      id: `root:${root}`,
      displayName: `${leaf} (${count})`,
      root,
      filter: null,
      tooltip: root,
    })
  }

  // Saved filter entries — mirrors foreach (var filter in _state.SavedFilters)
  for (const filter of savedFilters) {
    items.push({
      id: `filter:${filter.name}`,
      displayName: `🔎 ${filter.name}`,
      root: null,
      filter,
      tooltip: 'Saved filter — narrows the list to matching projects',
    })
  }

  return items
}
