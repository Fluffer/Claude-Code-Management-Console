/**
 * Concurrency regression tests for config.json / state.json.
 *
 * The main process is single-threaded but its IPC handlers are async, so two
 * read-modify-write sequences could interleave and drop one another's change —
 * the way a launch's lastUsed stamp used to vanish when it raced a config write.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadConfig, saveConfig, updateConfig } from '../../../src/main/services/configStore'
import { loadState, updateState } from '../../../src/main/services/stateStore'
import { createDefaultConfig } from '../../../src/core/config/configSerialization'
import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let tmpDir: string
let configPath: string
let statePath: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-concurrency-'))
  configPath = path.join(tmpDir, 'config.json')
  statePath = path.join(tmpDir, 'state.json')
})

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 100))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function makeDeps(): IpcHandlerDeps {
  return {
    configPath,
    statePath,
    claudeDir: path.join(tmpDir, '.claude'),
    processInspector: {
      findAllProcesses: vi.fn().mockResolvedValue([]),
      findClaudeSessions: vi.fn().mockResolvedValue([]),
    },
    sessionKiller: { kill: vi.fn().mockResolvedValue(true) },
    terminalLauncher: { launch: vi.fn().mockResolvedValue({ ok: true, pid: 1 }) },
    commandLocator: {
      findOnPath: vi.fn().mockResolvedValue(null),
      findWindowsTerminal: vi.fn().mockResolvedValue(null),
      findTerminalPath: vi.fn().mockResolvedValue(null),
      getPreferredShell: vi.fn().mockResolvedValue('powershell'),
    },
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
    openPath: vi.fn().mockResolvedValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined),
    openInVscode: vi.fn().mockResolvedValue({ ok: true }),
    approver: {
      init: vi.fn(),
      status: vi.fn(),
      set: vi.fn(),
      dispose: vi.fn(),
    } as unknown as IpcHandlerDeps['approver'],
  }
}

describe('updateConfig', () => {
  it('keeps every change when many updates run concurrently', async () => {
    await saveConfig(configPath, { ...createDefaultConfig(), roots: [] })

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateConfig(configPath, (c) => ({ ...c, roots: [...(c.roots ?? []), `C:\\root-${i}`] })),
      ),
    )

    const config = await loadConfig(configPath)
    expect(config.roots).toHaveLength(20)
    expect(new Set(config.roots)).toHaveLength(20)
  })

  it('gives each mutator the previous one\'s result, not a stale snapshot', async () => {
    await saveConfig(configPath, { ...createDefaultConfig(), roots: ['C:\\a'] })

    const seen: number[] = []
    await Promise.all([
      updateConfig(configPath, (c) => {
        seen.push((c.roots ?? []).length)
        return { ...c, roots: [...(c.roots ?? []), 'C:\\b'] }
      }),
      updateConfig(configPath, (c) => {
        seen.push((c.roots ?? []).length)
        return { ...c, roots: [...(c.roots ?? []), 'C:\\c'] }
      }),
    ])

    expect(seen).toEqual([1, 2])
  })
})

describe('updateState', () => {
  it('keeps every change when many updates run concurrently', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateState(statePath, (s) => ({ ...s, pinned: [...s.pinned, `C:\\proj-${i}`] })),
      ),
    )

    const state = await loadState(statePath)
    expect(state.pinned).toHaveLength(20)
  })
})

describe('launch usage vs concurrent writes', () => {
  it('does not lose a lastUsed stamp to a concurrent config:addRoots', async () => {
    const projectPath = path.join(tmpDir, 'proj')
    await saveConfig(configPath, {
      ...createDefaultConfig(),
      roots: [tmpDir],
      projects: { [projectPath]: { lastUsed: null, flags: '--model opus' } },
    })

    const handlers = createHandlers(makeDeps())

    await Promise.all([
      handlers['launch:run']({
        projectName: 'proj',
        projectPath,
        continueSession: true,
        flags: '',
      }),
      handlers['config:addRoots']({ paths: ['C:\\another-root'] }),
    ])

    const config = await loadConfig(configPath)
    // Both survived: the launch stamp AND the new root.
    expect(config.projects?.[projectPath]?.lastUsed).not.toBeNull()
    expect(config.projects?.[projectPath]?.flags).toBe('--model opus')
    expect(config.roots).toContain('C:\\another-root')
  })

  it('records every launch in recentLaunches when several land at once', async () => {
    const handlers = createHandlers(makeDeps())
    await saveConfig(configPath, { ...createDefaultConfig(), roots: [tmpDir] })

    await Promise.all(
      ['a', 'b', 'c'].map((name) =>
        handlers['launch:run']({
          projectName: name,
          projectPath: path.join(tmpDir, name),
          continueSession: false,
          flags: '',
        }),
      ),
    )

    const state = await loadState(statePath)
    expect(state.recentLaunches).toHaveLength(3)
  })
})
