import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { ToastProvider, useToast } from '../../../src/renderer/components/ui/Toast'

function Trigger({ withAction }: { withAction: boolean }): React.ReactElement {
  const { showToast } = useToast()
  return (
    <button
      onClick={() =>
        withAction
          ? showToast('Done', 'info', { label: 'Open', onClick: () => { (globalThis as Record<string, unknown>).__opened = true } })
          : showToast('Plain', 'info')
      }
    >
      go
    </button>
  )
}

describe('Toast action', () => {
  it('renders an action button and fires its onClick', () => {
    ;(globalThis as Record<string, unknown>).__opened = false
    render(<ToastProvider><Trigger withAction /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    const action = screen.getByText('Open')
    act(() => { action.click() })
    expect((globalThis as Record<string, unknown>).__opened).toBe(true)
  })

  it('still works with no action (backward compatible)', () => {
    render(<ToastProvider><Trigger withAction={false} /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    expect(screen.getByText('Plain')).toBeTruthy()
  })
})
