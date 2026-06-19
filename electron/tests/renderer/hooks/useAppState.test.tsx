import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../mockCcmc'
import { useAppState } from '../../../src/renderer/hooks/useAppState'
import type { AppState } from '../../../src/core/models'

const DEFAULT_STATE: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: [],
  onboardingDismissed: false,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [],
  groups: [],
  savedFilters: [],
  closeToTray: false,
}

describe('useAppState', () => {
  beforeEach(() => {
    installMockCcmc()
    setChannelResponse('state:read', { ...DEFAULT_STATE })
    setChannelResponse('state:write', undefined)
  })

  it('starts loading then returns state', async () => {
    const { result } = renderHook(() => useAppState())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.state?.sortMode).toBe('LastUsed')
  })

  it('setSortMode writes state via IPC', async () => {
    const invoke = getMockInvoke()
    const { result } = renderHook(() => useAppState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setSortMode('Name')
    })
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'state:write',
        expect.objectContaining({ sortMode: 'Name' }),
      ),
    )
    expect(result.current.state?.sortMode).toBe('Name')
  })

  it('togglePin adds path to pinned and writes state', async () => {
    const invoke = getMockInvoke()
    const { result } = renderHook(() => useAppState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.togglePin('/dev/root1/alpha')
    })
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'state:write',
        expect.objectContaining({ pinned: ['/dev/root1/alpha'] }),
      ),
    )
    expect(result.current.state?.pinned).toContain('/dev/root1/alpha')
  })

  it('togglePin removes already-pinned path', async () => {
    setChannelResponse('state:read', { ...DEFAULT_STATE, pinned: ['/dev/root1/alpha'] })
    const { result } = renderHook(() => useAppState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.togglePin('/dev/root1/alpha')
    })
    expect(result.current.state?.pinned).not.toContain('/dev/root1/alpha')
  })

  it('togglePin is case-insensitive', async () => {
    setChannelResponse('state:read', { ...DEFAULT_STATE, pinned: ['/Dev/Root1/Alpha'] })
    const { result } = renderHook(() => useAppState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.togglePin('/dev/root1/alpha')
    })
    expect(result.current.state?.pinned).toHaveLength(0)
  })
})
