/**
 * Tests for global keyboard shortcuts added in #17 and #18:
 *   Ctrl+N → opens new-project dialog
 *   F5     → triggers refresh (projects:scan re-invoked)
 *   Ctrl+P → opens command palette
 *
 * The palette open test verifies the palette container is visible.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
  terminalId: '',
}

const PROJECTS = [
  { name: 'alpha', root: '/r1', path: '/r1/alpha', lastUsedUtc: null, flags: '', description: '' },
]

describe('App global keyboard shortcuts', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('config:read', CONFIG)
    setChannelResponse('state:read', STATE)
    setChannelResponse('projects:scan', PROJECTS)
    setChannelResponse('sessions:listRunning', [])
    setChannelResponse('state:write', undefined)
    setChannelResponse('claude:version', { version: null })
    setChannelResponse('claude:onPath', { onPath: true })
    setChannelResponse('app:rendererReady', undefined)
  })

  it('Ctrl+N opens new-project dialog', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'n', ctrlKey: true })

    // New project dialog has a heading or label
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('F5 triggers a re-scan', async () => {
    const invoke = getMockInvoke()
    let scanCount = 0
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'state:read') return STATE
      if (channel === 'state:write') return undefined
      if (channel === 'sessions:listRunning') return []
      if (channel === 'claude:version') return { version: null }
      if (channel === 'claude:onPath') return { onPath: true }
      if (channel === 'app:rendererReady') return undefined
      if (channel === 'projects:scan') {
        scanCount++
        return PROJECTS
      }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    const before = scanCount

    fireEvent.keyDown(document, { key: 'F5' })

    await waitFor(() => expect(scanCount).toBeGreaterThan(before))
  })

  it('Ctrl+P opens the command palette', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'p', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })
  })

  it('Ctrl+K opens the command palette', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })
  })

  it('Ctrl+N does NOT open dialog when target is an input', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const input = screen.getByRole('textbox', { name: /search/i })
    fireEvent.keyDown(input, { key: 'n', ctrlKey: true, target: input })

    // Wait a tick to ensure any async dialog open would have fired
    await new Promise((r) => setTimeout(r, 30))

    // No dialog should be present
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('F5 does NOT trigger refresh when target is an input', async () => {
    const invoke = getMockInvoke()
    let scanCount = 0
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'state:read') return STATE
      if (channel === 'state:write') return undefined
      if (channel === 'sessions:listRunning') return []
      if (channel === 'claude:version') return { version: null }
      if (channel === 'claude:onPath') return { onPath: true }
      if (channel === 'app:rendererReady') return undefined
      if (channel === 'projects:scan') {
        scanCount++
        return PROJECTS
      }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    const before = scanCount

    const input = screen.getByRole('textbox', { name: /search/i })
    fireEvent.keyDown(input, { key: 'F5', target: input })

    await new Promise((r) => setTimeout(r, 30))

    expect(scanCount).toBe(before)
  })

  it('Ctrl+P still opens palette when target is an input', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const input = screen.getByRole('textbox', { name: /search/i })
    fireEvent.keyDown(input, { key: 'p', ctrlKey: true, target: input })

    await waitFor(() => {
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })
  })
})
