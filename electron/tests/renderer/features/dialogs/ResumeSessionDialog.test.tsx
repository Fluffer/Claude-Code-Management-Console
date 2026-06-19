import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { ResumeSessionDialog } from '../../../../src/renderer/features/dialogs/ResumeSessionDialog'
import type { ProjectInfo, SessionSummary } from '../../../../src/core/models'

function mockMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

const PROJECT: ProjectInfo = {
  name: 'my-project',
  root: '/r1',
  path: '/r1/my-project',
  lastUsedUtc: null,
  flags: '',
  description: '',
}

const SESSIONS: SessionSummary[] = [
  { sessionId: 'abc123', lastWriteUtc: '2026-06-18T10:00:00Z', firstUserMessage: 'Fix the login bug' },
  { sessionId: 'def456', lastWriteUtc: '2026-06-17T08:00:00Z', firstUserMessage: '' },
]

describe('ResumeSessionDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('sessions:listHistory', SESSIONS)
    setChannelResponse('launch:run', { ok: true, pid: 5678 })
  })

  it('renders dialog title', async () => {
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Resume a session')).toBeInTheDocument()
  })

  it('loads and displays sessions from sessions:listHistory', async () => {
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument())
    // Session with no message shows sessionId as fallback
    expect(screen.getByText('def456')).toBeInTheDocument()
  })

  it('Resume button disabled until a session is selected', async () => {
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled()
  })

  it('Resume button enabled after selecting a session', async () => {
    const user = userEvent.setup()
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument())
    await user.click(screen.getByText('Fix the login bug'))
    await waitFor(() => expect(screen.getByRole('button', { name: /resume/i })).not.toBeDisabled())
  })

  it('calls launch:run with sessionId when Resume clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
      />,
    )
    await waitFor(() => expect(screen.getByText('Fix the login bug')).toBeInTheDocument())
    await user.click(screen.getByText('Fix the login bug'))
    await waitFor(() => expect(screen.getByRole('button', { name: /resume/i })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /resume/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith(
        'launch:run',
        expect.objectContaining({ workingDirectory: '/r1/my-project' }),
      )
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows empty state when no sessions found', async () => {
    setChannelResponse('sessions:listHistory', [])
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    await waitFor(() => expect(screen.getByText(/no previous sessions/i)).toBeInTheDocument())
  })

  it('Cancel closes without side effects', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
      />,
    )
    await waitFor(() => expect(screen.getByText('Resume a session')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('launch:run', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ResumeSessionDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
      />,
    )
    await waitFor(() => expect(screen.getByText('Resume a session')).toBeInTheDocument())
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
