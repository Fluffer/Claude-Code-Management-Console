import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Checkbox } from '../../../src/renderer/components/ui/Checkbox'

describe('Checkbox', () => {
  it('renders a checkbox with a label', () => {
    render(<Checkbox checked={false} onChange={vi.fn()} label="Accept terms" />)
    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toBeInTheDocument()
  })

  it('is checked when checked=true', () => {
    render(<Checkbox checked={true} onChange={vi.fn()} label="Check" />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Checkbox checked={false} onChange={onChange} label="Toggle" />)
    await user.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('is disabled when disabled prop is set', () => {
    render(<Checkbox checked={false} onChange={vi.fn()} label="Disabled" disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
