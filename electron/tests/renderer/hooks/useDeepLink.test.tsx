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

function setup(): {
  onAction: ReturnType<typeof vi.fn>
  onUnresolved: ReturnType<typeof vi.fn>
  onConfirm: ReturnType<typeof vi.fn>
  unmount: () => void
} {
  const onAction = vi.fn()
  const onUnresolved = vi.fn()
  const onConfirm = vi.fn()
  const { unmount } = renderHook(() =>
    useDeepLink({ projects: PROJECTS, onAction, onUnresolved, onConfirm }),
  )
  return { onAction, onUnresolved, onConfirm, unmount }
}

describe('useDeepLink', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  // The security property: a deep link is the one launch path the app does not
  // initiate, so it must never reach onAction (the launcher) on its own.
  it('never launches without confirmation', () => {
    const { onAction, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=my-app&new=true' })
    })

    expect(onAction).not.toHaveBeenCalled()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('launches a trusted link straight away (tray menu, jump list)', () => {
    const { onAction, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', {
        url: 'ccmc://launch?project=my-app',
        trusted: true,
      })
    })

    expect(onAction).toHaveBeenCalledWith({ kind: 'launch-continue', project: PROJECTS[0] })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('asks to confirm a continue (match by path)', () => {
    const { onUnresolved, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=C%3A%5CDev%5Cmy-app' })
    })

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledWith(PROJECTS[0], false)
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('asks to confirm a new session (match by name)', () => {
    const { onUnresolved, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=my-app&new=true' })
    })

    expect(onConfirm).toHaveBeenCalledWith(PROJECTS[0], true)
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('matches project name case-insensitively', () => {
    const { onUnresolved, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=OTHER+PROJECT' })
    })

    expect(onConfirm).toHaveBeenCalledWith(PROJECTS[1], false)
    expect(onUnresolved).not.toHaveBeenCalled()
  })

  it('calls onUnresolved when project is not found', () => {
    const { onAction, onUnresolved, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=does-not-exist' })
    })

    expect(onUnresolved).toHaveBeenCalledOnce()
    expect(onUnresolved).toHaveBeenCalledWith('Deep link: no project "does-not-exist"')
    expect(onAction).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ignores non-launch actions', () => {
    const { onAction, onUnresolved, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://open?project=my-app' })
    })

    expect(onAction).not.toHaveBeenCalled()
    expect(onUnresolved).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ignores malformed / unparseable URLs', () => {
    const { onAction, onUnresolved, onConfirm } = setup()

    act(() => {
      emitEvent('event:deepLink', { url: 'not a url at all' })
    })

    expect(onAction).not.toHaveBeenCalled()
    expect(onUnresolved).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('unsubscribes from event:deepLink on unmount', () => {
    const { onAction, onConfirm, unmount } = setup()

    unmount()

    act(() => {
      emitEvent('event:deepLink', { url: 'ccmc://launch?project=my-app' })
    })

    expect(onAction).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
