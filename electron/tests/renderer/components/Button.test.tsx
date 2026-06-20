import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Button } from '../../../src/renderer/components/ui/Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<Button onClick={handler}>Action</Button>)
    await user.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup()
    const handler = vi.fn()
    render(<Button onClick={handler} disabled>Action</Button>)
    await user.click(screen.getByRole('button'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('applies accent variant class', () => {
    render(<Button variant="accent">Save</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/accent/)
  })

  it('applies subtle variant class', () => {
    render(<Button variant="subtle">Cancel</Button>)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/subtle/)
  })

  it('has type="button" by default to prevent form submission', () => {
    render(<Button>OK</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
