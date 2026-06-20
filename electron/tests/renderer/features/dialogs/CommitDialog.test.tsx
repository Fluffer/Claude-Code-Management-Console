import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { CommitDialog } from '../../../../src/renderer/features/dialogs/CommitDialog'
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
  flags: '',
  description: '',
}

describe('CommitDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('git:commit', { ok: true })
  })

  it('renders the dialog with project name', () => {
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText(/Commit — my-project/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/commit message/i)).toBeInTheDocument()
  })

  it('Commit and Commit & Push buttons are disabled when message is empty', () => {
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /^Commit$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Commit & Push/i })).toBeDisabled()
  })

  it('buttons enable when message is typed', async () => {
    const user = userEvent.setup()
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/commit message/i), 'fix: something')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Commit$/i })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: /Commit & Push/i })).not.toBeDisabled()
    })
  })

  it('Commit button sends push: false', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={onClose}
        onRefresh={onRefresh}
      />,
    )
    await user.type(screen.getByLabelText(/commit message/i), 'fix: something')
    await user.click(screen.getByRole('button', { name: /^Commit$/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith('git:commit', {
        path: '/r1/my-project',
        message: 'fix: something',
        push: false,
      })
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onRefresh).toHaveBeenCalled()
  })

  it('Commit & Push button sends push: true', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/commit message/i), 'feat: add thing')
    await user.click(screen.getByRole('button', { name: /Commit & Push/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith('git:commit', {
        path: '/r1/my-project',
        message: 'feat: add thing',
        push: true,
      })
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error inline and stays open on failure', async () => {
    setChannelResponse('git:commit', { ok: false, error: 'nothing to commit, working tree clean' })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/commit message/i), 'test commit')
    await user.click(screen.getByRole('button', { name: /^Commit$/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('nothing to commit, working tree clean')
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel closes without committing', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommitDialog
        open={true}
        project={project}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('git:commit', expect.anything())
  })
})
