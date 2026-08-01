import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { installMockCcmc, emitEvent, getMockInvoke } from '../mockCcmc'
import { useProjectEnrichment } from '../../../src/renderer/hooks/useProjectEnrichment'
import type { ProjectInfo, GitInfo } from '../../../src/core/models'

const PROJECTS: ProjectInfo[] = [
  { name: 'alpha', root: '/r1', path: '/r1/alpha', lastUsedUtc: null, flags: '', description: '' },
  { name: 'beta', root: '/r1', path: '/r1/beta', lastUsedUtc: null, flags: '', description: '' },
]

const GIT_INFO_ALPHA: GitInfo = { branch: 'main', isDirty: false }
const GIT_INFO_BETA: GitInfo = { branch: 'feat/x', isDirty: true }

describe('useProjectEnrichment', () => {
  const CLAUDE_INFO_DEFAULT = { hasClaudeMd: false, claudeMdFilename: null, hasMcp: false, defaultModel: null }

  beforeEach(() => {
    installMockCcmc()
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string, req: unknown) => {
      if (channel === 'git:info') {
        const r = req as { path: string }
        if (r.path === '/r1/alpha') return GIT_INFO_ALPHA
        if (r.path === '/r1/beta') return GIT_INFO_BETA
      }
      if (channel === 'projects:claudeInfo') return CLAUDE_INFO_DEFAULT
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
  })

  it('starts with empty enrichment map', () => {
    const { result } = renderHook(() =>
      useProjectEnrichment(PROJECTS),
    )
    expect(result.current.enrichments).toEqual({})
  })

  it('fetches git:info for each project and populates enrichment', async () => {
    const { result } = renderHook(() =>
      useProjectEnrichment(PROJECTS),
    )
    await waitFor(() => {
      expect(result.current.enrichments['/r1/alpha']).toBeDefined()
      expect(result.current.enrichments['/r1/beta']).toBeDefined()
    })
    expect(result.current.enrichments['/r1/alpha']?.gitBranch).toBe('main')
    expect(result.current.enrichments['/r1/alpha']?.gitDirty).toBe(false)
    expect(result.current.enrichments['/r1/beta']?.gitBranch).toBe('feat/x')
    expect(result.current.enrichments['/r1/beta']?.gitDirty).toBe(true)
  })

  it('normalizes an empty branch ("" from non-git paths) to null', async () => {
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string, _req: unknown) => {
      if (channel === 'git:info') return { branch: '', isDirty: null } as GitInfo
      if (channel === 'projects:claudeInfo') return CLAUDE_INFO_DEFAULT
      throw new Error(`Unhandled: ${channel}`)
    })
    const { result } = renderHook(() => useProjectEnrichment(PROJECTS))
    await waitFor(() => expect(result.current.enrichments['/r1/alpha']).toBeDefined())
    expect(result.current.enrichments['/r1/alpha']?.gitBranch).toBeNull()
  })

  it('calls git:info with the correct path for each project', async () => {
    renderHook(() => useProjectEnrichment(PROJECTS))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith('git:info', { path: '/r1/alpha' })
      expect(getMockInvoke()).toHaveBeenCalledWith('git:info', { path: '/r1/beta' })
    })
  })

  it('invalidates cache and re-fetches on event:fileChanged', async () => {
    const { result } = renderHook(() =>
      useProjectEnrichment(PROJECTS),
    )
    await waitFor(() => expect(result.current.enrichments['/r1/alpha']).toBeDefined())

    const beforeCallCount = getMockInvoke().mock.calls.length

    act(() => {
      emitEvent('event:fileChanged', { path: '/r1/alpha/somefile.ts' })
    })

    await waitFor(() => {
      expect(getMockInvoke().mock.calls.length).toBeGreaterThan(beforeCallCount)
    })
  })

  it('handles git:info failure gracefully (null enrichment for that project)', async () => {
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string, req: unknown) => {
      const r = req as { path: string }
      if (channel === 'git:info') {
        if (r.path === '/r1/alpha') throw new Error('git not found')
        if (r.path === '/r1/beta') return GIT_INFO_BETA
      }
      if (channel === 'projects:claudeInfo') return CLAUDE_INFO_DEFAULT
      throw new Error(`Unhandled: ${channel}`)
    })
    const { result } = renderHook(() =>
      useProjectEnrichment(PROJECTS),
    )
    await waitFor(() => expect(result.current.enrichments['/r1/beta']).toBeDefined())
    // alpha enrichment is null or has fallback values on error
    expect(result.current.enrichments['/r1/alpha']).toBeUndefined()
  })

  it('calls projects:claudeInfo for each project and populates hasClaudeMd/hasMcp', async () => {
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string, req: unknown) => {
      const r = req as { path: string }
      if (channel === 'git:info') {
        if (r.path === '/r1/alpha') return GIT_INFO_ALPHA
        if (r.path === '/r1/beta') return GIT_INFO_BETA
      }
      if (channel === 'projects:claudeInfo') {
        if (r.path === '/r1/alpha') return { hasClaudeMd: true, claudeMdFilename: 'CLAUDE.md', hasMcp: false }
        if (r.path === '/r1/beta') return { hasClaudeMd: false, claudeMdFilename: null, hasMcp: true }
      }
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })

    const { result } = renderHook(() => useProjectEnrichment(PROJECTS))
    await waitFor(() => {
      expect(result.current.enrichments['/r1/alpha']).toBeDefined()
      expect(result.current.enrichments['/r1/beta']).toBeDefined()
    })
    expect(result.current.enrichments['/r1/alpha']?.hasClaudeMd).toBe(true)
    expect(result.current.enrichments['/r1/alpha']?.hasMcp).toBe(false)
    expect(result.current.enrichments['/r1/beta']?.hasClaudeMd).toBe(false)
    expect(result.current.enrichments['/r1/beta']?.hasMcp).toBe(true)
  })

  it('limits concurrency: for 10 projects only ~8 git:info calls fire simultaneously', async () => {
    const manyProjects: ProjectInfo[] = Array.from({ length: 10 }, (_, i) => ({
      name: `proj${i}`,
      root: '/r1',
      path: `/r1/proj${i}`,
      lastUsedUtc: null,
      flags: '',
      description: '',
    }))

    let concurrent = 0
    let maxConcurrent = 0
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'git:info') {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 20))
        concurrent--
        return { branch: 'main', isDirty: false } as GitInfo
      }
      if (channel === 'projects:claudeInfo') {
        return { hasClaudeMd: false, claudeMdFilename: null, hasMcp: false }
      }
      throw new Error('unhandled')
    })

    const { result } = renderHook(() => useProjectEnrichment(manyProjects))
    await waitFor(() => {
      const enriched = Object.keys(result.current.enrichments).length
      return enriched === 10
    }, { timeout: 5000 })

    expect(maxConcurrent).toBeLessThanOrEqual(8)
  })
})
