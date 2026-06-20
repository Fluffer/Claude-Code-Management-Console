import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ToggleSwitch } from '../../../src/renderer/components/ui/ToggleSwitch'

describe('ToggleSwitch', () => {
  it('renders with a label', () => {
    render(<ToggleSwitch checked={false} onChange={vi.fn()} label="Dark mode" />)
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
  })

  it('has aria-checked=true when checked', () => {
    render(<ToggleSwitch checked={true} onChange={vi.fn()} label="On" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('has aria-checked=false when unchecked', () => {
    render(<ToggleSwitch checked={false} onChange={vi.fn()} label="Off" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ToggleSwitch checked={false} onChange={onChange} label="Toggle" />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ToggleSwitch checked={false} onChange={onChange} label="Toggle" disabled />)
    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
