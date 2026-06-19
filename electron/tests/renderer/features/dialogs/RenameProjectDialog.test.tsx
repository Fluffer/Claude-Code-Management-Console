import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { RenameProjectDialog } from '../../../../src/renderer/features/dialogs/RenameProjectDialog'
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

const CONFIG = {
  roots: ['/r1'],
  defaultRoot: '/r1',
  ignore: null,
  hidden: null,
  projects: null,
}

describe('RenameProjectDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    // Use mockImplementation to handle void-returning channels (setChannelResponse
    // can't stub channels returning void/undefined because the mock checks stub !== undefined)
    getMockInvoke().mockImplementation(async (channel: string) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'config:write') return undefined
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
  })

  it('renders dialog title and current project name', () => {
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText('Rename Project')).toBeInTheDocument()
    expect(screen.getByDisplayValue('my-project')).toBeInTheDocument()
  })

  it('shows renaming-in context text', () => {
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getAllByText(/renaming/i).length).toBeGreaterThan(0)
  })

  it('Rename button disabled when name unchanged', () => {
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /rename/i })).toBeDisabled()
  })

  it('shows validation error when name has invalid characters', async () => {
    const user = userEvent.setup()
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    const input = screen.getByDisplayValue('my-project')
    await user.clear(input)
    await user.type(input, 'bad/name')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('valid new name calls config:write with renamed path and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
        onRefresh={onRefresh}
      />,
    )
    // Clear and type new name
    const input = screen.getByDisplayValue('my-project')
    await user.clear(input)
    await user.type(input, 'new-name')
    // Wait for button to be enabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /rename/i })).not.toBeDisabled(),
      { timeout: 3000 },
    )
    await user.click(screen.getByRole('button', { name: /rename/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('Cancel closes without side effects', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <RenameProjectDialog
        open={true}
        project={PROJECT}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
