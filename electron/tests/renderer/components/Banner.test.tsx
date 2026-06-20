import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Banner } from '../../../src/renderer/components/ui/Banner'

describe('Banner', () => {
  it('renders the message', () => {
    render(<Banner severity="info" message="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders the title when provided', () => {
    render(<Banner severity="info" title="My Title" message="Some message" />)
    expect(screen.getByText('My Title')).toBeInTheDocument()
  })

  it('does not render a title element when title is omitted', () => {
    render(<Banner severity="info" message="No title here" />)
    expect(screen.queryByRole('strong')).not.toBeInTheDocument()
  })

  it('action button fires onAction when clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <Banner
        severity="info"
        message="msg"
        actionLabel="Do it"
        onAction={onAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Do it' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('does not render action button when actionLabel is absent', () => {
    render(<Banner severity="info" message="msg" onAction={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders close button only when onClose is provided', () => {
    const { rerender } = render(<Banner severity="info" message="msg" />)
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()

    const onClose = vi.fn()
    rerender(<Banner severity="info" message="msg" onClose={onClose} />)
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('close button fires onClose when clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Banner severity="warning" message="msg" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('has role="alert" for warning severity', () => {
    render(<Banner severity="warning" message="danger" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('has role="status" for info severity', () => {
    render(<Banner severity="info" message="info" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
