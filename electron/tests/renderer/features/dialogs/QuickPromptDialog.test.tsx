import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { QuickPromptDialog } from '../../../../src/renderer/features/dialogs/QuickPromptDialog'
import type { ProjectInfo } from '../../../../src/core/models'

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

describe('QuickPromptDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('launch:run', { ok: true, pid: 1234 })
  })

  it('renders dialog title and prompt textarea', () => {
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Quick prompt')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/type the first message/i)).toBeInTheDocument()
  })

  it('Launch button disabled when prompt is empty', () => {
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /launch/i })).toBeDisabled()
  })

  it('Launch button disabled when prompt is only whitespace', async () => {
    const user = userEvent.setup()
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    await user.type(screen.getByPlaceholderText(/type the first message/i), '   ')
    expect(screen.getByRole('button', { name: /launch/i })).toBeDisabled()
  })

  it('Launch button enabled when prompt has text', async () => {
    const user = userEvent.setup()
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
      />,
    )
    await user.type(screen.getByPlaceholderText(/type the first message/i), 'Fix the bug')
    await waitFor(() => expect(screen.getByRole('button', { name: /launch/i })).not.toBeDisabled())
  })

  it('calls launch:run with prompt and project path when submitted', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
      />,
    )
    await user.type(screen.getByPlaceholderText(/type the first message/i), 'Fix the bug')
    await waitFor(() => expect(screen.getByRole('button', { name: /launch/i })).not.toBeDisabled())
    await user.click(screen.getByRole('button', { name: /launch/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith(
        'launch:run',
        expect.objectContaining({ projectPath: '/r1/my-project', continueSession: false }),
      )
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancel closes without side effects', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('launch:run', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <QuickPromptDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
