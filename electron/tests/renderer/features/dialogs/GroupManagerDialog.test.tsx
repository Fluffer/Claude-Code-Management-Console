import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { settle } from '../../settle'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { GroupManagerDialog } from '../../../../src/renderer/features/dialogs/GroupManagerDialog'
import type { ProjectInfo, AppState } from '../../../../src/core/models'

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

const projects: ProjectInfo[] = [
  { name: 'proj-a', root: '/r1', path: '/r1/proj-a', lastUsedUtc: null, flags: '', description: '' },
  { name: 'proj-b', root: '/r1', path: '/r1/proj-b', lastUsedUtc: null, flags: '', description: '' },
]

const baseState: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: [],
  onboardingDismissed: false,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [],
  groups: [{ name: 'Group One', projectPaths: ['/r1/proj-a'] }],
  savedFilters: [],
  closeToTray: false,
  terminalId: '',
  defaultPermissionMode: 'auto',
}

describe('GroupManagerDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('state:read', baseState)
    setChannelResponse('state:write', null as unknown as void)
  })

  it('renders the dialog title', async () => {
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    expect(screen.getByText('Launch Groups')).toBeInTheDocument()
    await settle()
  })

  it('loads existing groups from state:read', async () => {
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('Group One')).toBeInTheDocument()
    })
  })

  it('shows projects checklist for selected group', async () => {
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Group One'))
    expect(screen.getByLabelText('proj-a')).toBeInTheDocument()
    expect(screen.getByLabelText('proj-b')).toBeInTheDocument()
  })

  it('can add a new group', async () => {
    const user = userEvent.setup()
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Group One'))
    await user.click(screen.getByRole('button', { name: /\+ Add/i }))
    await waitFor(() => expect(screen.getByText('New group')).toBeInTheDocument())
  })

  it('can remove a group', async () => {
    const user = userEvent.setup()
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Group One'))
    await user.click(screen.getByRole('button', { name: /Remove/i }))
    await waitFor(() => expect(screen.queryByText('Group One')).not.toBeInTheDocument())
  })

  it('Save calls state:write with updated groups', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={onClose} onRefresh={onRefresh} />,
    )
    await waitFor(() => screen.getByText('Group One'))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('state:write', expect.objectContaining({
        groups: expect.any(Array),
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancel closes without calling state:write', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={onClose} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Group One'))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('state:write', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <GroupManagerDialog open={true} projects={projects} onClose={onClose} onRefresh={vi.fn()} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
