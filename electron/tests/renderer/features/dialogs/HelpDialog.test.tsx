import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { HelpDialog } from '../../../../src/renderer/features/dialogs/HelpDialog'

function mockMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('HelpDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
  })

  it('renders the dialog title', () => {
    render(<HelpDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/Claude Code Management Console — Help/i)).toBeInTheDocument()
  })

  it('renders keyboard shortcuts section', () => {
    render(<HelpDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/Keyboard shortcuts/i)).toBeInTheDocument()
    expect(screen.getByText('Enter')).toBeInTheDocument()
    expect(screen.getByText('Ctrl+F')).toBeInTheDocument()
  })

  it('renders flag presets from core flagCatalog', () => {
    render(<HelpDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText('--model sonnet')).toBeInTheDocument()
    expect(screen.getByText('--model opus')).toBeInTheDocument()
    expect(screen.getByText('--verbose')).toBeInTheDocument()
  })

  it('renders Launching sessions section', () => {
    render(<HelpDialog open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/Launching sessions/i)).toBeInTheDocument()
  })

  it('Close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<HelpDialog open={true} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<HelpDialog open={true} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render when open=false', () => {
    render(<HelpDialog open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
