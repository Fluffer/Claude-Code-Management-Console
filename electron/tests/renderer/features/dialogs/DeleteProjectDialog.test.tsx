import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, getMockInvoke } from '../../mockCcmc'
import { DeleteProjectDialog } from '../../../../src/renderer/features/dialogs/DeleteProjectDialog'
import type { ProjectInfo } from '../../../../src/core/models'

function mockMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

const PROJECT: ProjectInfo = {
  name: 'doomed-project',
  root: '/r1',
  path: '/r1/doomed-project',
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

describe('DeleteProjectDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    getMockInvoke().mockImplementation(async (channel: string) => {
      if (channel === 'projects:delete') return { ok: true }
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
  })

  it('renders dialog title with project name', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText('Delete project')).toBeInTheDocument()
    expect(screen.getAllByText(/doomed-project/).length).toBeGreaterThan(0)
  })

  it('shows project path', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText('/r1/doomed-project')).toBeInTheDocument()
  })

  it('shows git-dirty warning when gitDirty=true', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={true}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getAllByText(/uncommitted changes/i).length).toBeGreaterThan(0)
  })

  it('does NOT show git-dirty warning when gitDirty=false (non-dirty)', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.queryByText(/uncommitted changes/i)).not.toBeInTheDocument()
  })

  it('does NOT show git-dirty warning when gitDirty=null (non-git folder)', () => {
    // C# behavior: DirtyBar.IsOpen = gitDirty; null/false → bar closed
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={null}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.queryByText(/uncommitted changes/i)).not.toBeInTheDocument()
  })

  it('Delete button disabled and session warning shown when isRunning=true', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeDisabled()
    expect(screen.getAllByText(/session is running/i).length).toBeGreaterThan(0)
  })

  it('Delete button enabled when not running', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).not.toBeDisabled()
  })

  it('has "Permanently delete" checkbox', () => {
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/permanently delete/i)).toBeInTheDocument()
  })

  it('Delete calls projects:delete with {path, permanent} and refreshes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={onClose}
        onRefresh={onRefresh}
      />,
    )
    // Check the "Permanently delete" checkbox to trigger permanent=true
    await user.click(screen.getByLabelText(/permanently delete/i))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith('projects:delete', {
        path: PROJECT.path,
        permanent: true,
      })
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Delete with permanent=false throws and shows error (soft delete not implemented)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    getMockInvoke().mockImplementation(async (channel: string) => {
      if (channel === 'projects:delete') throw new Error('Soft delete not yet implemented')
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    // Do NOT check permanent — leaves permanent=false
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => {
      expect(getMockInvoke()).toHaveBeenCalledWith('projects:delete', {
        path: PROJECT.path,
        permanent: false,
      })
    })
    // Dialog stays open on error
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel closes without side effects', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalled()
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <DeleteProjectDialog
        open={true}
        project={PROJECT}
        gitDirty={false}
        isRunning={false}
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
