import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ThemeProvider } from '../../../../src/renderer/theme/ThemeProvider'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { SettingsDialog } from '../../../../src/renderer/features/dialogs/SettingsDialog'
import type { AppState, LauncherConfig } from '../../../../src/core/models'

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
  savedFilters: [],
  closeToTray: false,
}

const baseConfig: LauncherConfig = {
  roots: ['/r1', '/r2'],
  defaultRoot: '/r1',
  ignore: null,
  hidden: null,
  projects: null,
}

function renderSettings(onClose = vi.fn(), onRefresh = vi.fn()): void {
  render(
    <ThemeProvider defaultTheme="light">
      <SettingsDialog open={true} onClose={onClose} onRefresh={onRefresh} />
    </ThemeProvider>,
  )
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('state:read', baseState)
    setChannelResponse('config:read', baseConfig)
    setChannelResponse('state:write', null as unknown as void)
    setChannelResponse('config:write', null as unknown as void)
    setChannelResponse('dialog:pickFolder', { path: null })
  })

  it('renders the dialog title', async () => {
    renderSettings()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows source roots from config:read', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getAllByText('/r1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('/r2').length).toBeGreaterThan(0)
    })
  })

  it('shows theme selector', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByLabelText(/Theme/i)).toBeInTheDocument()
    })
  })

  it('shows close to tray toggle', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /close to tray/i })).toBeInTheDocument()
    })
  })

  it('theme toggle applies immediately (calls setTheme)', async () => {
    const user = userEvent.setup()
    renderSettings()
    await waitFor(() => screen.getByLabelText(/Theme/i))
    const themeSelect = screen.getByLabelText(/Theme/i)
    await user.selectOptions(themeSelect, 'Dark')
    // document.documentElement should have data-theme updated
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  it('Save calls state:write and config:write', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    renderSettings(onClose, onRefresh)
    await waitFor(() => expect(screen.getAllByText('/r1').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('state:write', expect.any(Object))
      expect(invoke).toHaveBeenCalledWith('config:write', expect.any(Object))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Add root calls dialog:pickFolder', async () => {
    const user = userEvent.setup()
    renderSettings()
    await waitFor(() => expect(screen.getAllByText('/r1').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: /Add…/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('dialog:pickFolder', expect.anything())
    })
  })

  it('can remove a root', async () => {
    const user = userEvent.setup()
    renderSettings()
    await waitFor(() => expect(screen.getAllByText('/r2').length).toBeGreaterThan(0))
    // select /r2 and remove it (avoids ambiguity with /r1 in default combo)
    const listItems = screen.getAllByRole('option')
    const r2Item = listItems.find((el) => el.textContent === '/r2')
    if (r2Item) await user.click(r2Item)
    await user.click(screen.getByRole('button', { name: /Remove/i }))
    await waitFor(() => expect(screen.queryAllByText('/r2').length).toBe(0))
  })

  it('shows hidden projects when present', async () => {
    setChannelResponse('config:read', {
      ...baseConfig,
      hidden: ['/r1/hidden-proj'],
    })
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('/r1/hidden-proj')).toBeInTheDocument()
    })
  })

  it('Cancel closes without calling state:write', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSettings(onClose)
    await waitFor(() => expect(screen.getAllByText('/r1').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('state:write', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSettings(onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
