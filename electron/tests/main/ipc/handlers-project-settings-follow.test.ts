/**
 * Regression tests for the settings that must follow a project across a rename
 * or a move, and for the two project facts that used to be hardcoded in the
 * renderer (settings.json validity, newest session on disk).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import { loadConfig, saveConfig } from '../../../src/main/services/configStore'
import { loadState, saveState } from '../../../src/main/services/stateStore'
import { createDefaultConfig, parseState } from '../../../src/core/config/configSerialization'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ipc-follow-'))
})

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 100))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  return {
    configPath: path.join(tmpDir, 'config.json'),
    statePath: path.join(tmpDir, 'state.json'),
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
    openInVscode: vi.fn().mockResolvedValue({ ok: true }),
    approver: {
      init: vi.fn().mockResolvedValue(undefined),
      status: vi.fn(),
      set: vi.fn(),
      dispose: vi.fn(),
    } as unknown as IpcHandlerDeps['approver'],
    ...overrides,
  }
}

/** Seeds config.json + state.json with settings attached to `projectPath`. */
async function seedSettingsFor(deps: IpcHandlerDeps, projectPath: string): Promise<void> {
  await saveConfig(deps.configPath, {
    ...createDefaultConfig(),
    roots: [tmpDir],
    projects: { [projectPath]: { lastUsed: '2026-06-01T10:00:00.000Z', flags: '--model opus' } },
  })
  await saveState(deps.statePath, {
    ...parseState('{}'),
    pinned: [projectPath],
    recentLaunches: [projectPath],
    groups: [{ name: 'stack', projectPaths: [projectPath] }],
  })
}

describe('projects:rename — saved settings follow the folder', () => {
  it('re-keys flags and lastUsed, and rewrites pin, recents and group membership', async () => {
    const oldPath = path.join(tmpDir, 'old-name')
    await fs.mkdir(oldPath)

    const deps = makeDeps()
    await seedSettingsFor(deps, oldPath)
    const handlers = createHandlers(deps)

    const { path: newPath } = await handlers['projects:rename']({
      path: oldPath,
      newName: 'new-name',
    })
    expect(newPath).toBe(path.join(tmpDir, 'new-name'))

    const config = await loadConfig(deps.configPath)
    expect(config.projects).toEqual({
      [newPath]: { lastUsed: '2026-06-01T10:00:00.000Z', flags: '--model opus' },
    })

    const state = await loadState(deps.statePath)
    expect(state.pinned).toEqual([newPath])
    expect(state.recentLaunches).toEqual([newPath])
    expect(state.groups[0].projectPaths).toEqual([newPath])
  })

  it('leaves other projects\' settings alone', async () => {
    const oldPath = path.join(tmpDir, 'renamed')
    const otherPath = path.join(tmpDir, 'untouched')
    await fs.mkdir(oldPath)

    const deps = makeDeps()
    await saveConfig(deps.configPath, {
      ...createDefaultConfig(),
      roots: [tmpDir],
      projects: {
        [oldPath]: { lastUsed: null, flags: '--a' },
        [otherPath]: { lastUsed: null, flags: '--b' },
      },
    })
    const handlers = createHandlers(deps)

    await handlers['projects:rename']({ path: oldPath, newName: 'renamed-2' })

    const config = await loadConfig(deps.configPath)
    expect(config.projects?.[otherPath]).toEqual({ lastUsed: null, flags: '--b' })
  })
})

describe('projects:move — saved settings follow the folder', () => {
  it('re-keys flags and rewrites pin and recents to the new root', async () => {
    const sourceRoot = path.join(tmpDir, 'Active')
    const targetRoot = path.join(tmpDir, 'Archive')
    const oldPath = path.join(sourceRoot, 'proj')
    await fs.mkdir(oldPath, { recursive: true })
    await fs.mkdir(targetRoot, { recursive: true })

    const deps = makeDeps()
    await seedSettingsFor(deps, oldPath)
    const handlers = createHandlers(deps)

    const { newPath } = await handlers['projects:move']({ path: oldPath, targetRoot })
    expect(newPath).toBe(path.join(targetRoot, 'proj'))

    const config = await loadConfig(deps.configPath)
    expect(config.projects?.[newPath]?.flags).toBe('--model opus')
    expect(config.projects?.[oldPath]).toBeUndefined()

    const state = await loadState(deps.statePath)
    expect(state.pinned).toEqual([newPath])
    expect(state.recentLaunches).toEqual([newPath])
  })
})

describe('projects:claudeInfo — settings.json validity', () => {
  it('reports a parse error for a malformed .claude/settings.json', async () => {
    const projectPath = path.join(tmpDir, 'proj')
    await fs.mkdir(path.join(projectPath, '.claude'), { recursive: true })
    await fs.writeFile(path.join(projectPath, '.claude', 'settings.json'), '{ "model": }', 'utf8')

    const handlers = createHandlers(makeDeps())
    const info = await handlers['projects:claudeInfo']({ path: projectPath })

    expect(info.settingsError).not.toBeNull()
  })

  it('reports null for a valid settings.json', async () => {
    const projectPath = path.join(tmpDir, 'proj')
    await fs.mkdir(path.join(projectPath, '.claude'), { recursive: true })
    await fs.writeFile(path.join(projectPath, '.claude', 'settings.json'), '{"model":"opus"}', 'utf8')

    const handlers = createHandlers(makeDeps())
    const info = await handlers['projects:claudeInfo']({ path: projectPath })

    expect(info.settingsError).toBeNull()
  })

  it('reports null when the project has no settings.json at all', async () => {
    const projectPath = path.join(tmpDir, 'bare')
    await fs.mkdir(projectPath)

    const handlers = createHandlers(makeDeps())
    const info = await handlers['projects:claudeInfo']({ path: projectPath })

    expect(info.settingsError).toBeNull()
  })
})

describe('claude:latestVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the version published on npm', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '2.3.4' }) }),
    )

    const handlers = createHandlers(makeDeps())
    expect(await handlers['claude:latestVersion'](undefined)).toEqual({ version: '2.3.4' })
  })

  it('requests only the public package document, sending no user data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.0' }) })
    vi.stubGlobal('fetch', fetchMock)

    const handlers = createHandlers(makeDeps())
    await handlers['claude:latestVersion'](undefined)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://registry.npmjs.org/@anthropic-ai/claude-code/latest')
    expect(init).not.toHaveProperty('body')
    expect(init.method).toBeUndefined() // plain GET
    // The abbreviated 'vnd.npm.install-v1+json' type 406s on /latest — a mocked
    // fetch cannot catch that, so pin the header the live endpoint accepts.
    expect(init.headers).toEqual({ accept: 'application/json' })
  })

  it('returns null when the registry is unreachable (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')))

    const handlers = createHandlers(makeDeps())
    expect(await handlers['claude:latestVersion'](undefined)).toEqual({ version: null })
  })

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))

    const handlers = createHandlers(makeDeps())
    expect(await handlers['claude:latestVersion'](undefined)).toEqual({ version: null })
  })

  it('returns null when the payload has no version string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 42 }) }))

    const handlers = createHandlers(makeDeps())
    expect(await handlers['claude:latestVersion'](undefined)).toEqual({ version: null })
  })
})

describe('projects:claudeInfo — newest session', () => {
  it('returns null when the project has no transcripts (gates Continue)', async () => {
    const projectPath = path.join(tmpDir, 'never-used')
    await fs.mkdir(projectPath)

    const handlers = createHandlers(makeDeps())
    const info = await handlers['projects:claudeInfo']({ path: projectPath })

    expect(info.newestSessionUtc).toBeNull()
  })

  it('returns the newest transcript mtime when sessions exist', async () => {
    const projectPath = path.join(tmpDir, 'used')
    await fs.mkdir(projectPath)

    // Claude encodes the project path by replacing every non-alphanumeric char.
    const encoded = projectPath.replace(/[^A-Za-z0-9]/g, '-')
    const sessionDir = path.join(tmpDir, '.claude', 'projects', encoded)
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.writeFile(path.join(sessionDir, 'a.jsonl'), '{}\n', 'utf8')

    const handlers = createHandlers(makeDeps())
    const info = await handlers['projects:claudeInfo']({ path: projectPath })

    expect(info.newestSessionUtc).not.toBeNull()
    expect(Number.isNaN(Date.parse(info.newestSessionUtc as string))).toBe(false)
  })
})
