import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse } from '../../mockCcmc'
import { SkillsViewerDialog } from '../../../../src/renderer/features/dialogs/SkillsViewerDialog'
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

describe('SkillsViewerDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('skills:list', [
      { name: 'deep-research', description: 'Multi-source research harness' },
      { name: 'code-review', description: 'Review code for correctness' },
    ])
  })

  it('renders the dialog title', async () => {
    render(
      <SkillsViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    expect(await screen.findByText(/Skills — my-project/i)).toBeInTheDocument()
  })

  it('populates the list from the skills:list response', async () => {
    render(
      <SkillsViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('deep-research')).toBeInTheDocument()
      expect(screen.getByText('Multi-source research harness')).toBeInTheDocument()
    })
  })

  it('shows empty-state message when response is []', async () => {
    setChannelResponse('skills:list', [])
    render(
      <SkillsViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(
        screen.getByText(/No skills configured in this project\./i),
      ).toBeInTheDocument()
    })
  })

  it('renders error message (role="alert") when invoke rejects', async () => {
    // Replace the mock to throw instead of returning a value
    ;(window.ccmc.invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network failure'),
    )
    render(
      <SkillsViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('network failure')
    })
  })

  it('Close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <SkillsViewerDialog open={true} project={project} onClose={onClose} />,
    )
    await waitFor(() => screen.getByRole('button', { name: /close/i }))
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
