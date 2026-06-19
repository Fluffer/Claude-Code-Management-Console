import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { CommandBar } from '../../../../src/renderer/features/commandbar/CommandBar'

describe('CommandBar', () => {
  beforeEach(() => installMockCcmc())

  it('renders New Project button', () => {
    render(
      <CommandBar
        anySessionRunning={false}
        onNewProject={vi.fn()}
        onRefresh={vi.fn()}
        onStopAll={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
  })

  it('renders Refresh button', () => {
    render(
      <CommandBar
        anySessionRunning={false}
        onNewProject={vi.fn()}
        onRefresh={vi.fn()}
        onStopAll={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('calls onNewProject when New Project clicked', async () => {
    const user = userEvent.setup()
    const onNewProject = vi.fn()
    render(
      <CommandBar
        anySessionRunning={false}
        onNewProject={onNewProject}
        onRefresh={vi.fn()}
        onStopAll={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /new project/i }))
    expect(onNewProject).toHaveBeenCalledOnce()
  })

  it('calls onRefresh when Refresh clicked', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <CommandBar
        anySessionRunning={false}
        onNewProject={vi.fn()}
        onRefresh={onRefresh}
        onStopAll={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('hides Stop All when no sessions running', () => {
    render(
      <CommandBar
        anySessionRunning={false}
        onNewProject={vi.fn()}
        onRefresh={vi.fn()}
        onStopAll={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /stop all/i })).not.toBeInTheDocument()
  })

  it('shows Stop All when sessions are running', () => {
    render(
      <CommandBar
        anySessionRunning={true}
        onNewProject={vi.fn()}
        onRefresh={vi.fn()}
        onStopAll={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /stop all/i })).toBeInTheDocument()
  })

  it('calls onStopAll when Stop All clicked', async () => {
    const user = userEvent.setup()
    const onStopAll = vi.fn()
    render(
      <CommandBar
        anySessionRunning={true}
        onNewProject={vi.fn()}
        onRefresh={vi.fn()}
        onStopAll={onStopAll}
      />,
    )
    await user.click(screen.getByRole('button', { name: /stop all/i }))
    expect(onStopAll).toHaveBeenCalledOnce()
  })
})
