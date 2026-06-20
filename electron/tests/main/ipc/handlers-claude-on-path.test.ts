/**
 * Tests for the claude:onPath IPC handler.
 * Mocks commandLocator.findOnPath to exercise both found and not-found branches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-on-path-'))
})

afterEach(async () => {
  await new Promise<void>((r) => setTimeout(r, 50))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function makeDeps(findOnPathResult: string | null): IpcHandlerDeps {
  return {
    configPath: path.join(tmpDir, 'config.json'),
    statePath: path.join(tmpDir, 'state.json'),
    claudeDir: tmpDir,
    processInspector: {
      findAllProcesses: vi.fn().mockResolvedValue([]),
      findClaudeSessions: vi.fn().mockResolvedValue([]),
    },
    sessionKiller: {
      kill: vi.fn().mockResolvedValue(true),
    },
    terminalLauncher: {
      launch: vi.fn().mockResolvedValue({ ok: true, pid: 1 }),
    },
    commandLocator: {
      findOnPath: vi.fn().mockResolvedValue(findOnPathResult),
      findWindowsTerminal: vi.fn().mockResolvedValue(null),
      getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      findTerminalPath: vi.fn().mockResolvedValue(null),
    },
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
    openPath: vi.fn().mockResolvedValue(''),
    openInVscode: vi.fn().mockResolvedValue({ ok: true }),
  }
}

describe('claude:onPath handler', () => {
  it('returns { onPath: true } when findOnPath resolves a path', async () => {
    const deps = makeDeps('/usr/local/bin/claude')
    const handlers = createHandlers(deps)
    const result = await handlers['claude:onPath'](undefined as void)
    expect(result).toEqual({ onPath: true })
    expect(deps.commandLocator.findOnPath).toHaveBeenCalledWith('claude')
  })

  it('returns { onPath: false } when findOnPath returns null', async () => {
    const deps = makeDeps(null)
    const handlers = createHandlers(deps)
    const result = await handlers['claude:onPath'](undefined as void)
    expect(result).toEqual({ onPath: false })
    expect(deps.commandLocator.findOnPath).toHaveBeenCalledWith('claude')
  })
})
