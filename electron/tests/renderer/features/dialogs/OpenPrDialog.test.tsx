import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { OpenPrDialog } from '../../../../src/renderer/features/dialogs/OpenPrDialog'
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

describe('OpenPrDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('git:info', { branch: 'feat/my-feature', isDirty: false })
    setChannelResponse('git:openPr', { ok: true, url: 'https://github.com/me/repo/pull/42' })
    setChannelResponse('shell:openPath', { ok: true })
  })

  it('renders the dialog and loads branch info', async () => {
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Open PR — my-project/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/feat\/my-feature/)).toBeInTheDocument()
    })
  })

  it('prefills title with branch name', async () => {
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect((screen.getByLabelText(/PR title/i) as HTMLInputElement).value).toBe('feat/my-feature')
    })
  })

  it('does NOT show commit message field when tree is clean', async () => {
    setChannelResponse('git:info', { branch: 'feat/clean', isDirty: false })
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => screen.getByLabelText(/PR title/i))
    expect(screen.queryByLabelText(/commit message/i)).not.toBeInTheDocument()
  })

  it('shows commit message field when tree is dirty', async () => {
    setChannelResponse('git:info', { branch: 'feat/dirty', isDirty: true })
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => {
      expect(screen.getByLabelText(/commit message/i)).toBeInTheDocument()
    })
  })

  it('submit is disabled when dirty and commit message is empty', async () => {
    setChannelResponse('git:info', { branch: 'feat/dirty', isDirty: true })
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => screen.getByLabelText(/commit message/i))
    expect(screen.getByRole('button', { name: /Open PR/i })).toBeDisabled()
  })

  it('clean tree submits without commitMessage', async () => {
    setChannelResponse('git:info', { branch: 'feat/clean', isDirty: false })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={onClose}
      />,
    )
    await waitFor(() => screen.getByLabelText(/PR title/i))
    await user.click(screen.getByRole('button', { name: /Open PR/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('git:openPr', expect.objectContaining({
        path: '/r1/my-project',
        title: 'feat/clean',
        commitMessage: undefined,
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('dirty tree submits with commitMessage when filled', async () => {
    setChannelResponse('git:info', { branch: 'feat/dirty', isDirty: true })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={onClose}
      />,
    )
    await waitFor(() => screen.getByLabelText(/commit message/i))
    await user.type(screen.getByLabelText(/commit message/i), 'chore: pre-push commit')
    await user.click(screen.getByRole('button', { name: /Open PR/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('git:openPr', expect.objectContaining({
        path: '/r1/my-project',
        commitMessage: 'chore: pre-push commit',
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('success opens the PR url via shell:openPath', async () => {
    setChannelResponse('git:info', { branch: 'feat/pr', isDirty: false })
    const user = userEvent.setup()
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => screen.getByLabelText(/PR title/i))
    await user.click(screen.getByRole('button', { name: /Open PR/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith('shell:openPath', {
        path: 'https://github.com/me/repo/pull/42',
      })
    })
  })

  it('gh-not-found error shown inline verbatim', async () => {
    setChannelResponse('git:info', { branch: 'feat/pr', isDirty: false })
    setChannelResponse('git:openPr', {
      ok: false,
      error: 'GitHub CLI (gh) not found on PATH. Install gh and run `gh auth login`.',
    })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={onClose}
      />,
    )
    await waitFor(() => screen.getByLabelText(/PR title/i))
    await user.click(screen.getByRole('button', { name: /Open PR/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('GitHub CLI (gh) not found on PATH')
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel closes without submitting', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <OpenPrDialog
        open={true}
        project={project}
        onClose={onClose}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('git:openPr', expect.anything())
  })
})
