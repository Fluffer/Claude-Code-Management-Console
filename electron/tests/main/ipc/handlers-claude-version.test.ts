/**
 * Tests for the claude:version IPC handler.
 *
 * The spec permits testing only the null-path short-circuit (no spawn) for the
 * mock layer, because promisify(execFile) uses util.promisify.custom internally
 * and cannot be trivially replaced in vitest without complex symbol injection.
 *
 * The three covered cases are:
 *   1. findOnPath returns null → { version: null }, execFile never called.
 *   2. execFile resolves with version output → parsed version returned.
 *   3. execFile rejects → { version: null } (fail-soft).
 *
 * Cases 2+3 are exercised via the module-level execFileAsync mock below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// We mock the handlers module itself to intercept its private execFileAsync.
// The cleanest unit approach: mock the handlers module's dependency surface
// by providing a fake execFileAsync via a closure injected into a test-only
// re-implementation, OR use vi.mock on child_process with a custom symbol.
//
// Chosen: mock child_process at the module level.  The real execFile defines
// util.promisify.custom so that promisify resolves to {stdout,stderr}.
// Our mock replicates this by setting the same symbol on a vi.fn().
// ---------------------------------------------------------------------------
const { execFileMock } = vi.hoisted(() => {
  // Will be configured per-test
  const execFileMock = vi.fn()
  return { execFileMock }
})

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  // Copy the real util.promisify.custom from the original execFile so that
  // promisify(execFileMock) produces a proper {stdout,stderr}-resolving promise.
  // Then, per-test, we override the custom symbol with the test's desired result.
  return { ...original, execFile: execFileMock }
})

import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-version-'))
  execFileMock.mockReset()
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

describe('claude:version handler', () => {
  it('returns { version: null } when claude is not on PATH — execFile not called', async () => {
    const deps = makeDeps(null)
    const handlers = createHandlers(deps)
    const result = await handlers['claude:version'](undefined as void)
    expect(result).toEqual({ version: null })
    expect(deps.commandLocator.findOnPath).toHaveBeenCalledWith('claude')
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('returns the parsed version when execFile succeeds', async () => {
    // Set util.promisify.custom on the mock so that promisify resolves to {stdout,stderr}
    const { promisify } = await import('node:util')
    ;(execFileMock as unknown as Record<symbol, unknown>)[promisify.custom] = vi
      .fn()
      .mockResolvedValue({ stdout: '1.5.2 (Claude Code)', stderr: '' })

    const deps = makeDeps('/usr/local/bin/claude')
    const handlers = createHandlers(deps)
    const result = await handlers['claude:version'](undefined as void)
    expect(result).toEqual({ version: '1.5.2' })
  })

  it('returns { version: null } when execFile rejects (fail-soft)', async () => {
    const { promisify } = await import('node:util')
    ;(execFileMock as unknown as Record<symbol, unknown>)[promisify.custom] = vi
      .fn()
      .mockRejectedValue(new Error('spawn failed'))

    const deps = makeDeps('/usr/local/bin/claude')
    const handlers = createHandlers(deps)
    const result = await handlers['claude:version'](undefined as void)
    expect(result).toEqual({ version: null })
  })
})
