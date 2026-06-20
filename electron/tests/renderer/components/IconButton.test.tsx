import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { IconButton } from '../../../src/renderer/components/ui/IconButton'

describe('IconButton', () => {
  it('renders with an accessible label', () => {
    render(<IconButton aria-label="Close">✕</IconButton>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<IconButton aria-label="Delete" onClick={handler}>🗑</IconButton>)
    await user.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('is disabled when disabled prop is set', () => {
    render(<IconButton aria-label="Refresh" disabled>↺</IconButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
