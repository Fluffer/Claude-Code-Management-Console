/**
 * Tests for #20 — Claude version shown in the status bar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from './mockCcmc'
import App from '../../src/renderer/App'
import type { LauncherConfig, AppState } from '../../src/core/models'

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
  onboardingDismissed: true,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [],
  groups: [],
  savedFilters: [],
  closeToTray: false,
}

const PROJECTS = [
  { name: 'alpha', root: '/r1', path: '/r1/alpha', lastUsedUtc: null, flags: '', description: '' },
]

describe('App status bar — Claude version (#20)', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('config:read', CONFIG)
    setChannelResponse('state:read', STATE)
    setChannelResponse('projects:scan', PROJECTS)
    setChannelResponse('sessions:listRunning', [])
    setChannelResponse('state:write', undefined)
    setChannelResponse('claude:onPath', { onPath: true })
    setChannelResponse('app:rendererReady', undefined)
  })

  it('shows Claude version in footer when version is non-null', async () => {
    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'state:read') return STATE
      if (channel === 'state:write') return undefined
      if (channel === 'sessions:listRunning') return []
      if (channel === 'claude:onPath') return { onPath: true }
      if (channel === 'app:rendererReady') return undefined
      if (channel === 'projects:scan') return PROJECTS
      if (channel === 'claude:version') return { version: '1.2.3' }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    await waitFor(() => {
      expect(screen.getByText(/Claude v1\.2\.3/)).toBeInTheDocument()
    })
  })

  it('does not show Claude version in footer when version is null', async () => {
    setChannelResponse('claude:version', { version: null })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    // A bit of time for async hook to resolve
    await new Promise((r) => setTimeout(r, 50))

    expect(screen.queryByText(/Claude v/)).not.toBeInTheDocument()
  })
})
