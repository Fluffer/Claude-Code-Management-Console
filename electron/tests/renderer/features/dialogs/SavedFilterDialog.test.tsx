import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { settle } from '../../settle'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { SavedFilterDialog } from '../../../../src/renderer/features/dialogs/SavedFilterDialog'
import type { AppState } from '../../../../src/core/models'

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

const baseState: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: [],
  onboardingDismissed: false,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [],
  groups: [],
  savedFilters: [
    {
      name: 'Git projects',
      pathContains: null,
      requireGit: true,
      requireClaudeMd: false,
      requireRunning: false,
      requirePinned: false,
    },
  ],
  closeToTray: false,
  terminalId: '',
  defaultPermissionMode: 'auto',
}

describe('SavedFilterDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('state:read', baseState)
    setChannelResponse('state:write', null as unknown as void)
  })

  it('renders the dialog title', async () => {
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText('Saved Filters')).toBeInTheDocument()
    await settle()
  })

  it('loads existing filters from state:read', async () => {
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Git projects')).toBeInTheDocument()
    })
  })

  it('shows filter fields for selected filter', async () => {
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await waitFor(() => screen.getByText('Git projects'))
    expect(screen.getByLabelText(/Filter name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Path contains/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Require git/i)).toBeInTheDocument()
  })

  it('requireGit checkbox reflects state', async () => {
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await waitFor(() => screen.getByText('Git projects'))
    const gitCheck = screen.getByLabelText(/Require git/i) as HTMLInputElement
    expect(gitCheck.checked).toBe(true)
  })

  it('blocks save when filter name is empty', async () => {
    const user = userEvent.setup()
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await waitFor(() => screen.getByText('Git projects'))
    const nameInput = screen.getByLabelText(/Filter name/i)
    await user.tripleClick(nameInput)
    await user.keyboard('{Backspace}')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    })
  })

  it('can add a new filter', async () => {
    const user = userEvent.setup()
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await waitFor(() => screen.getByText('Git projects'))
    await user.click(screen.getByRole('button', { name: /\+ Add/i }))
    await waitFor(() => expect(screen.getByText('New filter')).toBeInTheDocument())
  })

  it('can remove a filter', async () => {
    const user = userEvent.setup()
    render(<SavedFilterDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />)
    await waitFor(() => screen.getByText('Git projects'))
    await user.click(screen.getByRole('button', { name: /^Remove$/i }))
    await waitFor(() => expect(screen.queryByText('Git projects')).not.toBeInTheDocument())
  })

  it('Save calls state:write with updated filters', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(<SavedFilterDialog open={true} onClose={onClose} onRefresh={onRefresh} />)
    await waitFor(() => screen.getByText('Git projects'))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('state:write', expect.objectContaining({
        savedFilters: expect.any(Array),
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancel closes without calling state:write', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SavedFilterDialog open={true} onClose={onClose} onRefresh={vi.fn()} />)
    await waitFor(() => screen.getByText('Git projects'))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('state:write', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SavedFilterDialog open={true} onClose={onClose} onRefresh={vi.fn()} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
