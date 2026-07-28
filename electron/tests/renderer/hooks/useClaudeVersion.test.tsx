import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { installMockCcmc, setChannelResponse } from '../mockCcmc'
import { useClaudeVersion } from '../../../src/renderer/hooks/useClaudeVersion'

describe('useClaudeVersion', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  it('returns null before resolving', () => {
    setChannelResponse('claude:version', { version: '1.2.3' })
    const { result } = renderHook(() => useClaudeVersion())
    // Synchronously null before the promise resolves
    expect(result.current.version).toBeNull()
  })

  it('returns the version string after IPC resolves', async () => {
    setChannelResponse('claude:version', { version: '1.2.3' })
    const { result } = renderHook(() => useClaudeVersion())
    await waitFor(() => expect(result.current.version).toBe('1.2.3'))
  })

  it('returns null when IPC returns null', async () => {
    setChannelResponse('claude:version', { version: null })
    const { result } = renderHook(() => useClaudeVersion())
    await waitFor(() => expect(result.current.version).toBeNull())
  })

  it('flags an update when npm publishes a newer version', async () => {
    setChannelResponse('claude:version', { version: '1.2.3' })
    setChannelResponse('claude:latestVersion', { version: '1.3.0' })
    const { result } = renderHook(() => useClaudeVersion())
    await waitFor(() => expect(result.current.updateAvailable).toBe(true))
    expect(result.current.latestVersion).toBe('1.3.0')
  })

  it('does not flag an update when the installed version is current', async () => {
    setChannelResponse('claude:version', { version: '1.3.0' })
    setChannelResponse('claude:latestVersion', { version: '1.3.0' })
    const { result } = renderHook(() => useClaudeVersion())
    await waitFor(() => expect(result.current.latestVersion).toBe('1.3.0'))
    expect(result.current.updateAvailable).toBe(false)
  })

  it('does not flag an update when the registry is unreachable', async () => {
    setChannelResponse('claude:version', { version: '1.2.3' })
    setChannelResponse('claude:latestVersion', { version: null })
    const { result } = renderHook(() => useClaudeVersion())
    await waitFor(() => expect(result.current.version).toBe('1.2.3'))
    expect(result.current.updateAvailable).toBe(false)
  })
})
