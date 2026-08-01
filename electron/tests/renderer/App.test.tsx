import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from './mockCcmc'
import App from '../../src/renderer/App'
import type { LauncherConfig, AppState, RunningSession } from '../../src/core/models'

// jsdom does not implement window.matchMedia; stub it for ThemeProvider
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

const CONFIG: LauncherConfig = {
  roots: ['/r1'],
  defaultRoot: '/r1',
  ignore: null,
  hidden: null,
  projects: null,
}

const STATE: AppState = {
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
  terminalId: '',
}

const PROJECTS = [
  { name: 'alpha', root: '/r1', path: '/r1/alpha', lastUsedUtc: null, flags: '', description: '' },
  { name: 'beta', root: '/r1', path: '/r1/beta', lastUsedUtc: null, flags: '', description: '' },
]

describe('App (integration)', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('config:read', CONFIG)
    setChannelResponse('state:read', STATE)
    setChannelResponse('projects:scan', PROJECTS)
    setChannelResponse('sessions:listRunning', [])
    setChannelResponse('state:write', undefined)
  })

  it('renders the project list after loading', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('renders sidebar with "All" entry', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/All \(/)).toBeInTheDocument())
  })

  it('sidebar root entry "r1" is rendered', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/r1 \(/)).toBeInTheDocument())
  })

  it('search box filters rows', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const searchBox = screen.getByPlaceholderText(/search/i)
    await user.type(searchBox, 'alp')
    await waitFor(() => expect(screen.queryByText('beta')).not.toBeInTheDocument())
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })

  it('Ctrl+F focuses the search box', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const searchBox = screen.getByPlaceholderText(/search/i)
    expect(searchBox).not.toHaveFocus()

    await user.keyboard('{Control>}f{/Control}')
    expect(searchBox).toHaveFocus()
  })

  it('Ctrl+F selects existing text so the next search replaces it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const searchBox = screen.getByPlaceholderText(/search/i) as HTMLInputElement
    await user.type(searchBox, 'alp')
    // Focus something else, then come back via the shortcut.
    searchBox.blur()

    await user.keyboard('{Control>}f{/Control}')
    expect(searchBox).toHaveFocus()
    expect(searchBox.selectionStart).toBe(0)
    expect(searchBox.selectionEnd).toBe('alp'.length)
  })

  it('shows running badge when a session matches a project path', async () => {
    const session: RunningSession = {
      pid: 1001,
      processName: 'claude',
      workingDirectory: '/r1/alpha',
    }
    setChannelResponse('sessions:listRunning', [session])
    render(<App />)
    // Wait for both projects and sessions to load, then check badge
    await waitFor(
      () => {
        expect(screen.getByText('alpha')).toBeInTheDocument()
        // "live" appears in both the row badge ("● live") and status bar ("· 1 live session")
        expect(screen.getAllByText(/live/i).length).toBeGreaterThanOrEqual(1)
      },
      { timeout: 3000 },
    )
  })

  it('Refresh button triggers re-scan', async () => {
    const user = userEvent.setup()
    const invoke = getMockInvoke()
    let scanCount = 0
    invoke.mockImplementation(async (channel: string, _req: unknown) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'state:read') return STATE
      if (channel === 'state:write') return undefined
      if (channel === 'sessions:listRunning') return []
      if (channel === 'projects:scan') {
        scanCount++
        return PROJECTS
      }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const beforeCount = scanCount
    await user.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(scanCount).toBeGreaterThan(beforeCount))
  })

  it('renders status bar project count', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText(/2 projects/i)).toBeInTheDocument())
  })

  it('shows "no projects found" empty state when no projects returned', async () => {
    setChannelResponse('projects:scan', [])
    render(<App />)
    await waitFor(() => expect(screen.getByText(/no projects found/i)).toBeInTheDocument())
  })
})
