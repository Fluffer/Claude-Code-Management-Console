/**
 * Tests for the fs:isDirectory IPC handler.
 * Uses real temp-dir and temp-file paths — no mocking needed for the happy paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-is-dir-'))
})

afterEach(async () => {
  await new Promise<void>((r) => setTimeout(r, 50))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function makeDeps(): IpcHandlerDeps {
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
      findOnPath: vi.fn().mockResolvedValue(null),
      findWindowsTerminal: vi.fn().mockResolvedValue(null),
      getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      findTerminalPath: vi.fn().mockResolvedValue(null),
    },
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
    openPath: vi.fn().mockResolvedValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined),
    openInVscode: vi.fn().mockResolvedValue({ ok: true }),
    approver: { init: vi.fn(), status: vi.fn(), set: vi.fn(), dispose: vi.fn() } as unknown as IpcHandlerDeps['approver'],
  }
}

describe('fs:isDirectory handler', () => {
  it('returns { ok: true } for a real directory', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['fs:isDirectory']({ path: tmpDir })
    expect(result).toEqual({ ok: true })
  })

  it('returns { ok: false } for a regular file', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await fs.writeFile(filePath, 'hello')
    const handlers = createHandlers(makeDeps())
    const result = await handlers['fs:isDirectory']({ path: filePath })
    expect(result).toEqual({ ok: false })
  })

  it('returns { ok: false } for a nonexistent path (ENOENT, fail-soft)', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['fs:isDirectory']({ path: path.join(tmpDir, 'does-not-exist') })
    expect(result).toEqual({ ok: false })
  })

  it('throws a TypeError when path is not a string (validation)', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error — intentionally passing wrong type to test validation
    await expect(handlers['fs:isDirectory']({ path: 42 })).rejects.toThrow(TypeError)
  })
})
