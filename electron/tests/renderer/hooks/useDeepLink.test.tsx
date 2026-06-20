import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { installMockCcmc, emitEvent } from '../mockCcmc'
import { useDeepLink } from '../../../src/renderer/hooks/useDeepLink'
import type { ProjectInfo } from '../../../src/core/models'

const PROJECTS: ProjectInfo[] = [
  {
    name: 'my-app',
    root: 'C:\\Dev',
    path: 'C:\\Dev\\my-app',
    lastUsedUtc: null,
    flags: '',
    description: '',
  },
  {
    name: 'Other Project',
    root: 'C:\\Dev',
    path: 'C:\\Dev\\other-project',
    lastUsedUtc: null,
    flags: '',
    description: '',
  },
]

describe('useDeepLink', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  it('dispatches launch-continue when newSession is false (match by path)', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    renderHook(() => useDeepLink({ projects: PROJECTS, onAction, onUnresolved }))

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=C%3A%5CDev%5Cmy-app' })
    })

    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({ kind: 'launch-continue', project: PROJECTS[0] })
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('dispatches launch-new when newSession is true (match by name)', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    renderHook(() => useDeepLink({ projects: PROJECTS, onAction, onUnresolved }))

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=my-app&new=true' })
    })

    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({ kind: 'launch-new', project: PROJECTS[0] })
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('matches project name case-insensitively', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    renderHook(() => useDeepLink({ projects: PROJECTS, onAction, onUnresolved }))

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=OTHER+PROJECT' })
    })

    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({ kind: 'launch-continue', project: PROJECTS[1] })
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('calls onUnresolved when project is not found', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    renderHook(() => useDeepLink({ projects: PROJECTS, onAction, onUnresolved }))

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=does-not-exist' })
    })

    expect(onUnresolved).toHaveBeenCalledOnce()
    expect(onUnresolved).toHaveBeenCalledWith('Deep link: no project "does-not-exist"')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('ignores non-launch actions', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    renderHook(() => useDeepLink({ projects: PROJECTS, onAction, onUnresolved }))

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://open?project=my-app' })
    })

    expect(onAction).not.toHaveBeenCalled()
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('ignores malformed / unparseable URLs', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    renderHook(() => useDeepLink({ projects: PROJECTS, onAction, onUnresolved }))

    act(() => {
      emitEvent('event:deepLink', { url: 'not a url at all' })
    })

    expect(onAction).not.toHaveBeenCalled()
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('unsubscribes from event:deepLink on unmount', () => {
    const onAction = vi.fn()
    const onUnresolved = vi.fn()

    const { unmount } = renderHook(() =>
      useDeepLink({ projects: PROJECTS, onAction, onUnresolved }),
    )

    unmount()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=my-app' })
    })

    expect(onAction).not.toHaveBeenCalled()
  })
})
