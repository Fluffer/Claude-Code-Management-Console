import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { settle } from '../settle'
import { installMockCcmc, setChannelResponse, emitEvent, getMockInvoke } from '../mockCcmc'
import { useProjects } from '../../../src/renderer/hooks/useProjects'
import type { LauncherConfig } from '../../../src/core/models'

const CONFIG_TWO_ROOTS: LauncherConfig = {
  roots: ['/dev/root1', '/dev/root2'],
  defaultRoot: '/dev/root1',
  ignore: null,
  hidden: null,
  projects: null,
}

const CONFIG_NO_ROOTS: LauncherConfig = {
  roots: null,
  defaultRoot: null,
  ignore: null,
  hidden: null,
  projects: null,
}

describe('useProjects', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  it('starts in loading state', async () => {
    setChannelResponse('config:read', CONFIG_NO_ROOTS)
    const { result } = renderHook(() => useProjects())
    expect(result.current.loading).toBe(true)
    await settle()
  })

  it('returns empty array when no roots configured', async () => {
    setChannelResponse('config:read', CONFIG_NO_ROOTS)
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('merges projects from multiple roots', async () => {
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string, req: unknown) => {
      if (channel === 'config:read') return CONFIG_TWO_ROOTS
      if (channel === 'projects:scan') {
        const { root } = req as { root: string }
        if (root === '/dev/root1')
          return [{ name: 'alpha', root: '/dev/root1', path: '/dev/root1/alpha', lastUsedUtc: null, flags: '', description: '' }]
        if (root === '/dev/root2')
          return [{ name: 'beta', root: '/dev/root2', path: '/dev/root2/beta', lastUsedUtc: null, flags: '', description: '' }]
      }
      return []
    })

    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toHaveLength(2)
    expect(result.current.projects.map((p) => p.name)).toEqual(
      expect.arrayContaining(['alpha', 'beta']),
    )
  })

  it('exposes error state when scan fails', async () => {
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'config:read') return CONFIG_TWO_ROOTS
      throw new Error('scan failed')
    })
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/scan failed/)
  })

  it('refresh() re-runs the scan', async () => {
    setChannelResponse('config:read', CONFIG_NO_ROOTS)
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    setChannelResponse('config:read', { ...CONFIG_TWO_ROOTS, roots: ['/dev/root1'] })
    setChannelResponse('projects:scan', [
      { name: 'alpha', root: '/dev/root1', path: '/dev/root1/alpha', lastUsedUtc: null, flags: '', description: '' },
    ])

    act(() => {
      result.current.refresh()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.projects).toHaveLength(1)
  })

  it('re-scans when event:fileChanged is emitted', async () => {
    setChannelResponse('config:read', CONFIG_NO_ROOTS)
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.loading).toBe(false))

    setChannelResponse('config:read', { ...CONFIG_TWO_ROOTS, roots: ['/dev/root1'] })
    setChannelResponse('projects:scan', [
      { name: 'new-proj', root: '/dev/root1', path: '/dev/root1/new-proj', lastUsedUtc: null, flags: '', description: '' },
    ])

    act(() => {
      emitEvent('event:fileChanged', { path: '/dev/root1' })
    })
    await waitFor(() => expect(result.current.projects).toHaveLength(1))
    expect(result.current.projects[0].name).toBe('new-proj')
  })
})
