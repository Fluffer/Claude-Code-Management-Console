import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, getMockInvoke } from '../../mockCcmc'
import { ApplyProfileDialog } from '../../../../src/renderer/features/dialogs/ApplyProfileDialog'
import type { AppState, LauncherConfig, ProjectInfo } from '../../../../src/core/models'

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

const STATE: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: [],
  onboardingDismissed: true,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [
    { name: 'Safe reader', model: 'sonnet', permissionMode: 'plan', allowedTools: ['Read'], disallowedTools: [] },
    { name: 'Opus free rein', model: 'opus', permissionMode: null, allowedTools: [], disallowedTools: [] },
  ],
  groups: [],
  savedFilters: [],
  closeToTray: false,
  terminalId: '',
}

const CONFIG: LauncherConfig = {
  roots: ['/r1'],
  defaultRoot: '/r1',
  ignore: null,
  hidden: null,
  projects: { '/r1/my-project': { lastUsed: null, flags: '--model haiku' } },
}

let written: LauncherConfig | null = null

describe('ApplyProfileDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    written = null
    getMockInvoke().mockImplementation(async (channel: string, req: unknown) => {
      if (channel === 'state:read') return STATE
      if (channel === 'config:read') return CONFIG
      if (channel === 'config:write') {
        written = req as LauncherConfig
        return undefined
      }
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
  })

  it('lists saved profiles with their composed flags', async () => {
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Safe reader')).toBeInTheDocument())
    expect(screen.getByText('--model sonnet --permission-mode plan --allowedTools Read')).toBeInTheDocument()
    expect(screen.getByText('--model opus')).toBeInTheDocument()
  })

  it('writes the composed flags into the project on apply', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const onClose = vi.fn()
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={onClose} onRefresh={onRefresh} />,
    )
    await waitFor(() => expect(screen.getByText('Safe reader')).toBeInTheDocument())

    await user.click(screen.getByText('Safe reader'))
    await user.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(written).not.toBeNull())
    expect(written?.projects?.['/r1/my-project'].flags).toBe(
      '--model sonnet --permission-mode plan --allowedTools Read',
    )
    expect(onRefresh).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('preserves other projects and the lastUsed stamp when writing', async () => {
    const user = userEvent.setup()
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Safe reader')).toBeInTheDocument())

    await user.click(screen.getByText('Opus free rein'))
    await user.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => expect(written).not.toBeNull())
    expect(written?.roots).toEqual(['/r1'])
    expect(written?.projects?.['/r1/my-project'].lastUsed).toBeNull()
  })

  it('shows the flags that are about to be replaced', async () => {
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('--model haiku')).toBeInTheDocument())
  })

  it('Apply is disabled until a profile is picked', async () => {
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Safe reader')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
  })

  it('guides the user to Profiles… when none are saved', async () => {
    getMockInvoke().mockImplementation(async (channel: string) => {
      if (channel === 'state:read') return { ...STATE, profiles: [] }
      if (channel === 'config:read') return CONFIG
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText(/no profiles saved yet/i)).toBeInTheDocument())
  })

  it('marks a hand-edited unsafe profile as unusable instead of throwing', async () => {
    getMockInvoke().mockImplementation(async (channel: string) => {
      if (channel === 'state:read') {
        return {
          ...STATE,
          profiles: [
            { name: 'Broken', model: null, permissionMode: null, allowedTools: ['Bash(git:*)'], disallowedTools: [] },
          ],
        }
      }
      if (channel === 'config:read') return CONFIG
      throw new Error(`[test] Unhandled channel: ${channel}`)
    })
    const user = userEvent.setup()
    render(
      <ApplyProfileDialog open={true} project={PROJECT} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Broken')).toBeInTheDocument())
    expect(screen.getByText(/unusable —/)).toBeInTheDocument()

    await user.click(screen.getByText('Broken'))
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
  })
})
