/**
 * Tests for #19 drag-drop folder → add source root.
 *
 * Mocks window.ccmc.pathForFile + fs:isDirectory to simulate dropping files.
 * Verifies that a directory gets added via config:addRoots (atomic main-process op).
 * Verifies that a non-directory is ignored with a toast.
 * Regression: overlay stays hidden after dragEnter+dragOver+dragLeave without drop.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { settle } from './settle'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke, setPathForFile } from './mockCcmc'
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
  defaultPermissionMode: 'auto',
}

const PROJECTS = [
  { name: 'alpha', root: '/r1', path: '/r1/alpha', lastUsedUtc: null, flags: '', description: '' },
]

function makeDropEvent(files: File[]): Partial<React.DragEvent> {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      files: files as unknown as FileList,
    } as DataTransfer,
  }
}

describe('App drag-drop (#19)', () => {
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
    setChannelResponse('config:addRoots', { added: 1 })
  })

  /** Drops `paths` on the app root, with fs:isDirectory answering true. */
  async function dropDirs(
    paths: string[],
    calls: { channel: string; req: unknown }[],
  ): Promise<void> {
    let i = 0
    setPathForFile((_file: File) => paths[i++ % paths.length])

    const invoke = getMockInvoke()
    invoke.mockImplementation(async (channel: string, req: unknown) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'state:read') return STATE
      if (channel === 'state:write') return undefined
      if (channel === 'sessions:listRunning') return []
      if (channel === 'claude:version') return { version: null }
      if (channel === 'claude:onPath') return { onPath: true }
      if (channel === 'app:rendererReady') return undefined
      if (channel === 'projects:scan') return PROJECTS
      if (channel === 'fs:isDirectory') return { ok: true }
      if (channel === 'config:addRoots') {
        calls.push({ channel, req })
        return { added: paths.length }
      }
      if (channel === 'launch:run') {
        calls.push({ channel, req })
        return { ok: true, pid: 42 }
      }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const appRoot = document.querySelector('.flex.flex-col.h-screen') as HTMLElement
    const dropEvent = makeDropEvent(paths.map((p) => new File([], p)))
    fireEvent.dragEnter(appRoot, dropEvent)
    fireEvent.drop(appRoot, dropEvent)
  }

  // One folder is ambiguous — a projects folder to scan, or a repo to work in
  // now — so it asks instead of guessing.
  it('dropping one directory asks what to do instead of adding it silently', async () => {
    const calls: { channel: string; req: unknown }[] = []
    await dropDirs(['/new-root'], calls)

    await waitFor(() => expect(screen.getByText(/dropped a folder/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /add as source root/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /launch claude here/i })).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('choosing "Add as source root" calls config:addRoots with that path', async () => {
    const user = userEvent.setup()
    const calls: { channel: string; req: unknown }[] = []
    await dropDirs(['/new-root'], calls)

    await waitFor(() => expect(screen.getByText(/dropped a folder/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /add as source root/i }))

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].channel).toBe('config:addRoots')
    expect((calls[0].req as { paths: string[] }).paths).toContain('/new-root')
  })

  it('choosing "Launch Claude here" starts a session without recording usage', async () => {
    const user = userEvent.setup()
    const calls: { channel: string; req: unknown }[] = []
    await dropDirs(['/repos/widget'], calls)

    await waitFor(() => expect(screen.getByText(/dropped a folder/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /launch claude here/i }))

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].channel).toBe('launch:run')
    const req = calls[0].req as {
      projectPath: string
      projectName: string
      continueSession: boolean
      recordUsage: boolean
    }
    expect(req.projectPath).toBe('/repos/widget')
    // Session name is the folder leaf, not the full path.
    expect(req.projectName).toBe('widget')
    expect(req.continueSession).toBe(false)
    // A dropped folder is not necessarily a tracked project, so it must not
    // enter lastUsed or the recents MRU.
    expect(req.recordUsage).toBe(false)
  })

  it('dropping several directories adds them all as roots without asking', async () => {
    const calls: { channel: string; req: unknown }[] = []
    await dropDirs(['/a', '/b'], calls)

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].channel).toBe('config:addRoots')
    expect((calls[0].req as { paths: string[] }).paths).toEqual(['/a', '/b'])
    expect(screen.queryByText(/dropped a folder/i)).not.toBeInTheDocument()
  })

  it('dropping a non-directory does not call config:addRoots', async () => {
    setPathForFile((_file: File) => '/some-file.txt')

    const invoke = getMockInvoke()
    const addRootsCalls: unknown[] = []
    invoke.mockImplementation(async (channel: string, req: unknown) => {
      if (channel === 'config:read') return CONFIG
      if (channel === 'state:read') return STATE
      if (channel === 'state:write') return undefined
      if (channel === 'sessions:listRunning') return []
      if (channel === 'claude:version') return { version: null }
      if (channel === 'claude:onPath') return { onPath: true }
      if (channel === 'app:rendererReady') return undefined
      if (channel === 'projects:scan') return PROJECTS
      if (channel === 'fs:isDirectory') return { ok: false }
      if (channel === 'config:addRoots') {
        addRootsCalls.push(req)
        return { added: 0 }
      }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const appRoot = document.querySelector('.flex.flex-col.h-screen') as HTMLElement
    const file = new File([], '/some-file.txt')
    const dropEvent = makeDropEvent([file])

    fireEvent.dragEnter(appRoot, dropEvent)
    fireEvent.drop(appRoot, dropEvent)
    // The drop handler is async (fs:isDirectory then a toast); let it finish.
    await settle()

    // Give async drop handler time to complete
    await new Promise((r) => setTimeout(r, 50))

    expect(addRootsCalls).toHaveLength(0)
  })

  it('shows DropOverlay while dragging', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const appRoot = document.querySelector('.flex.flex-col.h-screen') as HTMLElement
    const file = new File([], 'test')
    fireEvent.dragEnter(appRoot, { preventDefault: vi.fn(), dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(
        screen.getByText('Drop a folder to add it as a source root'),
      ).toBeInTheDocument()
    })
  })

  it('overlay is hidden after dragEnter + multiple dragOver + dragLeave (counter bug regression)', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const appRoot = document.querySelector('.flex.flex-col.h-screen') as HTMLElement
    const file = new File([], 'test')
    const dragEvt = { preventDefault: vi.fn(), dataTransfer: { files: [file] } }

    fireEvent.dragEnter(appRoot, dragEvt)
    // Several dragOver events fire continuously during a drag — these must not increment the counter
    fireEvent.dragOver(appRoot, dragEvt)
    fireEvent.dragOver(appRoot, dragEvt)
    fireEvent.dragOver(appRoot, dragEvt)
    // Cursor leaves the window without dropping
    fireEvent.dragLeave(appRoot, dragEvt)

    await waitFor(() => {
      expect(
        screen.queryByText('Drop a folder to add it as a source root'),
      ).not.toBeInTheDocument()
    })
  })
})
