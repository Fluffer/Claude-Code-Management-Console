import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { settle } from '../../settle'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { WorktreePickerDialog } from '../../../../src/renderer/features/dialogs/WorktreePickerDialog'
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

const worktrees = [
  { path: '/r1/my-project', branch: 'main', isDetached: false, isBare: false },
  { path: '/r1/my-project-feat', branch: 'feat/new-feature', isDetached: false, isBare: false },
  { path: '/r1/my-project-detached', branch: null, isDetached: true, isBare: false },
]

describe('WorktreePickerDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('git:worktrees', worktrees)
    setChannelResponse('launch:run', { ok: true, pid: 12345 })
    setChannelResponse('git:addWorktree', { ok: true, path: '/r1/my-project-feat-x' })
  })

  it('renders the dialog title', async () => {
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    expect(await screen.findByText(/Worktrees — my-project/i)).toBeInTheDocument()
  })

  it('lists worktrees from git:worktrees', async () => {
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
      expect(screen.getByText('feat/new-feature')).toBeInTheDocument()
      expect(screen.getByText('(detached)')).toBeInTheDocument()
    })
  })

  it('Launch button is disabled until worktree is selected', async () => {
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('main'))
    expect(screen.getByRole('button', { name: 'Launch' })).toBeDisabled()
  })

  it('selecting a worktree enables the Launch button', async () => {
    const user = userEvent.setup()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('main'))
    await user.click(screen.getByText('main'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Launch' })).not.toBeDisabled()
    })
  })

  it('Launch calls launch:run with the worktree path', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={onClose} />,
    )
    await waitFor(() => screen.getByText('feat/new-feature'))
    // click on the feat worktree path row
    const rows = screen.getAllByRole('option')
    await user.click(rows[1]) // feat/new-feature row
    await user.click(screen.getByRole('button', { name: 'Launch' }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('launch:run', expect.objectContaining({
        projectPath: '/r1/my-project-feat',
        continueSession: false,
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows empty state when no worktrees', async () => {
    setChannelResponse('git:worktrees', [])
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText(/No git worktrees found/i)).toBeInTheDocument()
    })
  })

  it('Cancel closes without calling launch:run', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={onClose} />,
    )
    await waitFor(() => screen.getByText('main'))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('launch:run', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={onClose} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Create new worktree ---

  it('Create & launch is disabled until a branch name is entered', async () => {
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /create & launch/i })).toBeDisabled()
    await settle()
  })

  it('shows a live resolved path preview as the branch is typed', async () => {
    const user = userEvent.setup()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await user.type(screen.getByLabelText(/new worktree branch name/i), 'feat/x')
    // /r1/my-project + feat/x -> /r1/my-project-feat-x
    expect(screen.getByText(/\/r1\/my-project-feat-x/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create & launch/i })).not.toBeDisabled()
  })

  it('creates a worktree then launches into the returned path (recordUsage false)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={onClose} />,
    )
    await user.type(screen.getByLabelText(/new worktree branch name/i), 'feat/x')
    await user.click(screen.getByRole('button', { name: /create & launch/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('git:addWorktree', {
        repoPath: '/r1/my-project',
        branch: 'feat/x',
      })
      expect(invoke).toHaveBeenCalledWith('launch:run', expect.objectContaining({
        projectPath: '/r1/my-project-feat-x',
        continueSession: false,
        recordUsage: false,
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows an error and stays open when worktree creation fails', async () => {
    setChannelResponse('git:addWorktree', { ok: false, error: 'branch already exists' })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <WorktreePickerDialog open={true} project={project} onClose={onClose} />,
    )
    await user.type(screen.getByLabelText(/new worktree branch name/i), 'feat/dup')
    await user.click(screen.getByRole('button', { name: /create & launch/i }))
    await waitFor(() => {
      expect(screen.getByText(/branch already exists/i)).toBeInTheDocument()
    })
    expect(getMockInvoke()).not.toHaveBeenCalledWith('launch:run', expect.anything())
    expect(onClose).not.toHaveBeenCalled()
  })
})
