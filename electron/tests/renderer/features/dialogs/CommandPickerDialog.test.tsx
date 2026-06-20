import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { CommandPickerDialog } from '../../../../src/renderer/features/dialogs/CommandPickerDialog'
import type { ProjectInfo } from '../../../../src/core/models'

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

const project: ProjectInfo = {
  name: 'my-project',
  root: '/r1',
  path: '/r1/my-project',
  lastUsedUtc: null,
  flags: '--model opus',
  description: '',
}

describe('CommandPickerDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('commands:list', [
      { name: 'review', description: 'Review staged changes' },
      { name: 'deploy', description: 'Deploy to staging' },
    ])
    setChannelResponse('launch:run', { ok: true })
  })

  it('renders the dialog title', () => {
    render(
      <CommandPickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/Run command — my-project/i)).toBeInTheDocument()
  })

  it('lists commands with leading slash from commands:list response', async () => {
    render(
      <CommandPickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('/review')).toBeInTheDocument()
      expect(screen.getByText('/deploy')).toBeInTheDocument()
    })
  })

  it('shows empty-state message when response is []', async () => {
    setChannelResponse('commands:list', [])
    render(
      <CommandPickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(
        screen.getByText(/No slash commands configured in this project\./i),
      ).toBeInTheDocument()
    })
  })

  it('renders error message (role="alert") when commands:list rejects', async () => {
    ;(window.ccmc.invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('read error'),
    )
    render(
      <CommandPickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('read error')
    })
  })

  it('clicking a command calls launch:run with correct args and then onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommandPickerDialog open={true} project={project} onClose={onClose} />,
    )
    await waitFor(() => screen.getByText('/review'))
    await user.click(screen.getByText('/review'))

    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('launch:run', {
        projectName: project.name,
        projectPath: project.path,
        continueSession: false,
        initialPrompt: '/review',
        flags: '--model opus',
      })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows error alert and does not call onClose when launch:run returns ok:false', async () => {
    setChannelResponse('launch:run', { ok: false, error: 'boom' })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommandPickerDialog open={true} project={project} onClose={onClose} />,
    )
    await waitFor(() => screen.getByText('/review'))
    await user.click(screen.getByText('/review'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('boom')
    })
    expect(onClose).not.toHaveBeenCalled()
  })
})
