import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useProjectList } from '../../../../src/renderer/features/projects/useProjectList'
import type { ProjectInfo, SavedFilter } from '../../../../src/core/models'
import type { SidebarEntry } from '../../../../src/renderer/features/sidebar/sidebarItems'

function makeProject(name: string, root: string, lastUsed: string | null = null): ProjectInfo {
  return { name, root, path: `${root}/${name}`, lastUsedUtc: lastUsed, flags: '', description: '' }
}

const ROOT1 = '/r1'
const ROOT2 = '/r2'
const PROJECTS: ProjectInfo[] = [
  makeProject('alpha', ROOT1, '2026-06-01T00:00:00Z'),
  makeProject('beta', ROOT1, '2026-06-10T00:00:00Z'),
  makeProject('gamma', ROOT2, '2026-05-01T00:00:00Z'),
]

const ALL_ENTRY: SidebarEntry = {
  id: '__all__',
  displayName: 'All (3)',
  root: null,
  filter: null,
  tooltip: '',
}
const ROOT1_ENTRY: SidebarEntry = {
  id: `root:${ROOT1}`,
  displayName: 'r1 (2)',
  root: ROOT1,
  filter: null,
  tooltip: '',
}

const PINNED_FILTER: SavedFilter = {
  name: 'Pinned',
  pathContains: null,
  requireGit: false,
  requireClaudeMd: false,
  requireRunning: false,
  requirePinned: true,
}
const FILTER_ENTRY: SidebarEntry = {
  id: 'filter:Pinned',
  displayName: '🔎 Pinned',
  root: null,
  filter: PINNED_FILTER,
  tooltip: '',
}

const RUNNING_FILTER: SavedFilter = {
  name: 'Running',
  pathContains: null,
  requireGit: false,
  requireClaudeMd: false,
  requireRunning: true,
  requirePinned: false,
}
const RUNNING_FILTER_ENTRY: SidebarEntry = {
  id: 'filter:Running',
  displayName: '🔎 Running',
  root: null,
  filter: RUNNING_FILTER,
  tooltip: '',
}

const CLAUDEMD_FILTER: SavedFilter = {
  name: 'HasClaudeMd',
  pathContains: null,
  requireGit: false,
  requireClaudeMd: true,
  requireRunning: false,
  requirePinned: false,
}
const CLAUDEMD_FILTER_ENTRY: SidebarEntry = {
  id: 'filter:HasClaudeMd',
  displayName: '🔎 HasClaudeMd',
  root: null,
  filter: CLAUDEMD_FILTER,
  tooltip: '',
}

function enrich(over: Partial<import('../../../../src/renderer/features/projects/ProjectRow').ProjectEnrichment>) {
  return {
    gitBranch: null,
    gitDirty: null,
    hasClaudeMd: false,
    hasMcp: false,
    hasCommands: false,
    hasSkills: false,
    hasSettingsError: false,
    settingsError: '',
    hasSession: true,
    isStale: false,
    defaultModel: null,
    ...over,
  }
}

describe('useProjectList', () => {
  it('requireClaudeMd matches only projects whose enrichment has CLAUDE.md', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: CLAUDEMD_FILTER_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
        enrichments: {
          [`${ROOT1}/alpha`]: enrich({ hasClaudeMd: true }),
          [`${ROOT1}/beta`]: enrich({ hasClaudeMd: false }),
        },
      }),
    )
    expect(result.current.map((p) => p.name)).toEqual(['alpha'])
  })

  it('requireClaudeMd matches nothing until enrichment is present', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: CLAUDEMD_FILTER_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
      }),
    )
    expect(result.current).toHaveLength(0)
  })

  it('returns all projects when sidebar = All and search empty', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: ALL_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
      }),
    )
    expect(result.current).toHaveLength(3)
  })

  it('filters by root when a root sidebar entry is selected', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: ROOT1_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
      }),
    )
    expect(result.current).toHaveLength(2)
    expect(result.current.every((p) => p.root === ROOT1)).toBe(true)
  })

  it('filters by search text (substring match on name)', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: ALL_ENTRY,
        searchText: 'alp',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
      }),
    )
    expect(result.current).toHaveLength(1)
    expect(result.current[0].name).toBe('alpha')
  })

  it('filters by saved filter (requirePinned)', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: FILTER_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [PROJECTS[0].path],
        runningSessions: [],
      }),
    )
    expect(result.current).toHaveLength(1)
    expect(result.current[0].name).toBe('alpha')
  })

  it('filters by saved filter (requireRunning)', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: RUNNING_FILTER_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [
          { pid: 1, processName: 'claude', workingDirectory: PROJECTS[1].path },
        ],
      }),
    )
    expect(result.current).toHaveLength(1)
    expect(result.current[0].name).toBe('beta')
  })

  it('sorts by LastUsed descending (pinned first)', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: ALL_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [PROJECTS[2].path], // gamma pinned
        runningSessions: [],
      }),
    )
    expect(result.current[0].name).toBe('gamma') // pinned
    expect(result.current[1].name).toBe('beta')  // most recent
    expect(result.current[2].name).toBe('alpha')
  })

  it('sorts by Name ascending (pinned first)', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: ALL_ENTRY,
        searchText: '',
        sortMode: 'Name',
        pinned: [PROJECTS[2].path], // gamma pinned
        runningSessions: [],
      }),
    )
    expect(result.current[0].name).toBe('gamma') // pinned
    expect(result.current[1].name).toBe('alpha') // name A-Z
    expect(result.current[2].name).toBe('beta')
  })

  it('returns empty array when no projects match search', () => {
    const { result } = renderHook(() =>
      useProjectList({
        projects: PROJECTS,
        selectedSidebar: ALL_ENTRY,
        searchText: 'zzz',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
      }),
    )
    expect(result.current).toHaveLength(0)
  })

  it('null/undefined lastUsedUtc sorts to the end', () => {
    const noDate = makeProject('nodate', ROOT1, null)
    const withDate = makeProject('withdate', ROOT1, '2026-06-01T00:00:00Z')
    const { result } = renderHook(() =>
      useProjectList({
        projects: [noDate, withDate],
        selectedSidebar: ALL_ENTRY,
        searchText: '',
        sortMode: 'LastUsed',
        pinned: [],
        runningSessions: [],
      }),
    )
    expect(result.current[0].name).toBe('withdate')
    expect(result.current[1].name).toBe('nodate')
  })
})
