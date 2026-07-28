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

  it('dropping a directory calls config:addRoots with the directory path', async () => {
    setPathForFile((_file: File) => '/new-root')
    setChannelResponse('fs:isDirectory', { ok: true })

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
      if (channel === 'fs:isDirectory') return { ok: true }
      if (channel === 'config:addRoots') {
        addRootsCalls.push(req)
        return { added: 1 }
      }
      return undefined
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())

    const appRoot = document.querySelector('.flex.flex-col.h-screen') as HTMLElement

    const file = new File([], '/new-root')
    const dropEvent = makeDropEvent([file])

    fireEvent.dragEnter(appRoot, dropEvent)
    fireEvent.drop(appRoot, dropEvent)

    await waitFor(() => {
      expect(addRootsCalls.length).toBeGreaterThan(0)
      const req = addRootsCalls[0] as { paths: string[] }
      expect(req.paths).toContain('/new-root')
    })
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
