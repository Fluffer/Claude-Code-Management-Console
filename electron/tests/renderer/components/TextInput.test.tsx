import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { TextInput } from '../../../src/renderer/components/ui/TextInput'

describe('TextInput', () => {
  it('renders with placeholder', () => {
    render(<TextInput placeholder="Search…" value="" onChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
  })

  it('calls onChange with new value on user input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextInput value="" onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('is disabled when disabled prop is set', () => {
    render(<TextInput value="" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('displays the controlled value', () => {
    render(<TextInput value="current" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('current')
  })
})
