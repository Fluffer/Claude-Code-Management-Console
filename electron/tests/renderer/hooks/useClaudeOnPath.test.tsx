import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { installMockCcmc, setChannelResponse, emitEvent } from '../mockCcmc'
import { useClaudeOnPath } from '../../../src/renderer/hooks/useClaudeOnPath'

describe('useClaudeOnPath', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  it('defaults to true before the first result resolves', () => {
    // Do not configure a channel stub — invoke will be pending
    setChannelResponse('claude:onPath', { onPath: true })
    const { result } = renderHook(() => useClaudeOnPath())
    // Immediately after mount, before await, default is true
    expect(result.current.onPath).toBe(true)
  })

  it('returns true when IPC resolves onPath:true', async () => {
    setChannelResponse('claude:onPath', { onPath: true })
    const { result } = renderHook(() => useClaudeOnPath())
    await waitFor(() => expect(result.current.onPath).toBe(true))
  })

  it('returns false when IPC resolves onPath:false', async () => {
    setChannelResponse('claude:onPath', { onPath: false })
    const { result } = renderHook(() => useClaudeOnPath())
    await waitFor(() => expect(result.current.onPath).toBe(false))
  })

  it('re-checks on event:fileChanged', async () => {
    setChannelResponse('claude:onPath', { onPath: true })
    const { result } = renderHook(() => useClaudeOnPath())
    await waitFor(() => expect(result.current.onPath).toBe(true))

    // Simulate CLI being removed from PATH
    setChannelResponse('claude:onPath', { onPath: false })
    act(() => {
      emitEvent('event:fileChanged', { path: '/some/watched/path' })
    })
    await waitFor(() => expect(result.current.onPath).toBe(false))
  })
})
