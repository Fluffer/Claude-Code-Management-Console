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
})
