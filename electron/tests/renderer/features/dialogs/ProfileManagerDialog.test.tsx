import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { ProfileManagerDialog } from '../../../../src/renderer/features/dialogs/ProfileManagerDialog'
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
  profiles: [
    {
      name: 'Fast',
      model: 'sonnet',
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit'],
      disallowedTools: [],
    },
  ],
  groups: [],
  savedFilters: [],
  closeToTray: false,
  terminalId: '',
}

describe('ProfileManagerDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('state:read', baseState)
    setChannelResponse('state:write', null as unknown as void)
  })

  it('renders the dialog title', async () => {
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    expect(screen.getByText('Launch Profiles')).toBeInTheDocument()
  })

  it('loads existing profiles from state:read', async () => {
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('Fast')).toBeInTheDocument()
    })
  })

  it('shows profile fields for selected profile', async () => {
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Fast'))
    expect(screen.getByLabelText(/Profile name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Model/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Permission mode/i)).toBeInTheDocument()
  })

  it('shows preview of composed flags', async () => {
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Fast'))
    await waitFor(() => {
      expect(screen.getByText(/Preview/i)).toBeInTheDocument()
    })
  })

  it('can add a new profile', async () => {
    const user = userEvent.setup()
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Fast'))
    await user.click(screen.getByRole('button', { name: /\+ Add/i }))
    await waitFor(() => expect(screen.getByText('New profile')).toBeInTheDocument())
  })

  it('can remove a profile', async () => {
    const user = userEvent.setup()
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Fast'))
    await user.click(screen.getByRole('button', { name: /^Remove$/i }))
    await waitFor(() => expect(screen.queryByText('Fast')).not.toBeInTheDocument())
  })

  it('Save calls state:write with updated profiles', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <ProfileManagerDialog open={true} onClose={onClose} onRefresh={onRefresh} />,
    )
    await waitFor(() => screen.getByText('Fast'))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('state:write', expect.objectContaining({
        profiles: expect.any(Array),
      }))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('model "Default" saves as null', async () => {
    const user = userEvent.setup()
    const stateNoModel: AppState = {
      ...baseState,
      profiles: [{ name: 'Bare', model: null, permissionMode: null, allowedTools: [], disallowedTools: [] }],
    }
    setChannelResponse('state:read', stateNoModel)
    render(
      <ProfileManagerDialog open={true} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Bare'))
    // model combo should show "Default"
    const modelSelect = screen.getByLabelText(/Model/i) as HTMLSelectElement
    expect(modelSelect.value).toBe('Default')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      const call = invoke.mock.calls.find((c: unknown[]) => c[0] === 'state:write')
      const saved = (call![1] as AppState).profiles[0]
      expect(saved.model).toBeNull()
    })
  })

  it('Cancel closes without calling state:write', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ProfileManagerDialog open={true} onClose={onClose} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('Fast'))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('state:write', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ProfileManagerDialog open={true} onClose={onClose} onRefresh={vi.fn()} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
