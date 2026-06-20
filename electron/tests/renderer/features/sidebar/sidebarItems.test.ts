import { describe, it, expect } from 'vitest'
import { buildSidebarItems } from '../../../../src/renderer/features/sidebar/sidebarItems'
import type { ProjectInfo, SavedFilter } from '../../../../src/core/models'

const PROJECTS: ProjectInfo[] = [
  { name: 'alpha', root: '/root1', path: '/root1/alpha', lastUsedUtc: null, flags: '', description: '' },
  { name: 'beta', root: '/root1', path: '/root1/beta', lastUsedUtc: null, flags: '', description: '' },
  { name: 'gamma', root: '/root2', path: '/root2/gamma', lastUsedUtc: null, flags: '', description: '' },
]

const FILTER: SavedFilter = {
  name: 'Pinned',
  pathContains: null,
  requireGit: false,
  requireClaudeMd: false,
  requireRunning: false,
  requirePinned: true,
}

describe('buildSidebarItems', () => {
  it('first entry is "All (N)" with null root and null filter', () => {
    const items = buildSidebarItems(['/root1', '/root2'], PROJECTS, [])
    expect(items[0].displayName).toBe('All (3)')
    expect(items[0].root).toBeNull()
    expect(items[0].filter).toBeNull()
    expect(items[0].id).toBe('__all__')
  })

  it('creates one entry per root with project count', () => {
    const items = buildSidebarItems(['/root1', '/root2'], PROJECTS, [])
    const root1 = items.find((i) => i.root === '/root1')
    const root2 = items.find((i) => i.root === '/root2')
    expect(root1?.displayName).toBe('root1 (2)')
    expect(root2?.displayName).toBe('root2 (1)')
  })

  it('appends saved filters after root entries with filter set', () => {
    const items = buildSidebarItems(['/root1'], PROJECTS, [FILTER])
    const last = items[items.length - 1]
    expect(last.filter?.name).toBe('Pinned')
    expect(last.root).toBeNull()
    expect(last.displayName).toBe('🔎 Pinned')
  })

  it('handles empty roots array — only "All" entry', () => {
    const items = buildSidebarItems([], [], [])
    expect(items).toHaveLength(1)
    expect(items[0].displayName).toBe('All (0)')
  })

  it('root leaf name is used (not full path)', () => {
    const items = buildSidebarItems(['/home/user/projects'], PROJECTS.slice(0, 2), [])
    const rootEntry = items.find((i) => i.root === '/home/user/projects')
    expect(rootEntry?.displayName).toMatch(/^projects/)
  })

  it('root count is case-insensitive match', () => {
    const mixed = [
      { name: 'alpha', root: '/Root1', path: '/Root1/alpha', lastUsedUtc: null, flags: '', description: '' },
    ]
    const items = buildSidebarItems(['/root1'], mixed, [])
    const rootEntry = items.find((i) => i.root === '/root1')
    expect(rootEntry?.displayName).toBe('root1 (1)')
  })
})
