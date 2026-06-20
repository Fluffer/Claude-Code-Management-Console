import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import { createDefaultConfig } from '../../../src/core/config/configSerialization'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'
import type { RunningSession } from '../../../src/core/models'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ipc-handlers-'))
})

afterEach(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 100))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function makeConfigPath(): string {
  return path.join(tmpDir, 'config.json')
}

function makeStatePath(): string {
  return path.join(tmpDir, 'state.json')
}

function makeDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  const runningSessions: RunningSession[] = []

  return {
    configPath: makeConfigPath(),
    statePath: makeStatePath(),
    claudeDir: tmpDir,
    processInspector: {
      findAllProcesses: vi.fn().mockResolvedValue([]),
      findClaudeSessions: vi.fn().mockResolvedValue(runningSessions),
    },
    sessionKiller: {
      kill: vi.fn().mockResolvedValue(true),
    },
    terminalLauncher: {
      launch: vi.fn().mockResolvedValue({ ok: true, pid: 12345 }),
    },
    commandLocator: {
      findOnPath: vi.fn().mockResolvedValue(null),
      findWindowsTerminal: vi.fn().mockResolvedValue(null),
      getPreferredShell: vi.fn().mockResolvedValue('powershell'),
    },
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
    openPath: vi.fn().mockResolvedValue(''),
    openInVscode: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// config:read
// ---------------------------------------------------------------------------

describe('config:read', () => {
  it('returns default config when file is absent and writes it (first-run)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['config:read'](undefined)

    expect(result).toEqual(createDefaultConfig())

    // First-run: file must have been written
    const exists = await fs.access(deps.configPath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('returns parsed config from existing file', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // Write a config first
    const cfg = createDefaultConfig()
    cfg.roots = ['C:\\MyProjects']
    await handlers['config:write'](cfg)

    const result = await handlers['config:read'](undefined)
    expect(result.roots).toEqual(['C:\\MyProjects'])
  })
})

// ---------------------------------------------------------------------------
// config:write
// ---------------------------------------------------------------------------

describe('config:write', () => {
  it('saves config and can be read back', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const cfg = createDefaultConfig()
    cfg.defaultRoot = 'D:\\Dev'
    await handlers['config:write'](cfg)

    const result = await handlers['config:read'](undefined)
    expect(result.defaultRoot).toBe('D:\\Dev')
  })

  it('throws on null payload', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['config:write'](null)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// state:read / state:write
// ---------------------------------------------------------------------------

describe('state:read', () => {
  it('returns default state when file absent', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['state:read'](undefined)
    expect(result).toHaveProperty('theme')
    expect(result).toHaveProperty('sortMode')
  })
})

describe('state:write', () => {
  it('saves state and can be read back', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const state = await handlers['state:read'](undefined)
    state.theme = 'Dark'
    await handlers['state:write'](state)

    const result = await handlers['state:read'](undefined)
    expect(result.theme).toBe('Dark')
  })

  it('throws on null payload', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['state:write'](null)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// projects:scan
// ---------------------------------------------------------------------------

describe('projects:scan', () => {
  it('returns projects array for a valid root', async () => {
    const projectDir = path.join(tmpDir, 'projects')
    const proj1 = path.join(projectDir, 'my-app')
    await fs.mkdir(proj1, { recursive: true })

    const deps = makeDeps({ configPath: makeConfigPath(), statePath: makeStatePath() })
    const handlers = createHandlers(deps)

    // Write config with the root
    const cfg = createDefaultConfig()
    cfg.roots = [projectDir]
    await handlers['config:write'](cfg)

    const result = await handlers['projects:scan']({ root: projectDir })
    expect(Array.isArray(result)).toBe(true)
    expect(result.some((p) => p.name === 'my-app')).toBe(true)
  })

  it('throws when root is missing from payload', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:scan']({})).rejects.toThrow()
  })

  it('throws when root is not a string', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:scan']({ root: 42 })).rejects.toThrow()
  })

  it('returns empty array for non-existent root', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:scan']({ root: path.join(tmpDir, 'nonexistent') })
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// sessions:listHistory
// ---------------------------------------------------------------------------

describe('sessions:listHistory', () => {
  it('returns empty array when claudeDir has no projects', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['sessions:listHistory']({})
    expect(Array.isArray(result)).toBe(true)
  })

  it('accepts undefined projectPath', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['sessions:listHistory']({})
    expect(Array.isArray(result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sessions:listRunning
// ---------------------------------------------------------------------------

describe('sessions:listRunning', () => {
  it('calls processInspector.findClaudeSessions and returns result', async () => {
    const mockSessions: RunningSession[] = [{ pid: 1234, processName: 'node', workingDirectory: '/some/path' }]
    const deps = makeDeps({
      processInspector: {
        findAllProcesses: vi.fn().mockResolvedValue([]),
        findClaudeSessions: vi.fn().mockResolvedValue(mockSessions),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['sessions:listRunning'](undefined)
    expect(result).toEqual(mockSessions)
    expect(deps.processInspector.findClaudeSessions).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// sessions:kill
// ---------------------------------------------------------------------------

describe('sessions:kill', () => {
  it('calls sessionKiller.kill and returns { ok: true } on success', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['sessions:kill']({ pid: 5678 })
    expect(result).toEqual({ ok: true })
    expect(deps.sessionKiller.kill).toHaveBeenCalledWith(5678)
  })

  it('returns { ok: false } when killer returns false', async () => {
    const deps = makeDeps({
      sessionKiller: { kill: vi.fn().mockResolvedValue(false) },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['sessions:kill']({ pid: 999 })
    expect(result).toEqual({ ok: false })
  })

  it('throws when pid is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['sessions:kill']({})).rejects.toThrow()
  })

  it('throws when pid is not a number', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['sessions:kill']({ pid: 'abc' })).rejects.toThrow()
  })

  it('throws when pid is zero', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    await expect(handlers['sessions:kill']({ pid: 0 })).rejects.toThrow()
  })

  it('throws when pid is negative', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    await expect(handlers['sessions:kill']({ pid: -1 })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// git:info
// ---------------------------------------------------------------------------

describe('git:info', () => {
  it('returns GitInfo with branch and isDirty', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['git:info']({ path: tmpDir })
    expect(result).toHaveProperty('branch')
    expect(result).toHaveProperty('isDirty')
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['git:info']({})).rejects.toThrow()
  })

  it('throws when path is not a string', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['git:info']({ path: 123 })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// git:worktrees
// ---------------------------------------------------------------------------

describe('git:worktrees', () => {
  it('returns an array for a valid path', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['git:worktrees']({ path: tmpDir })
    expect(Array.isArray(result)).toBe(true)
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['git:worktrees']({})).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// launch:run (new high-level contract)
// ---------------------------------------------------------------------------

describe('launch:run', () => {
  it('calls commandLocator and terminalLauncher, returns { ok, pid }', async () => {
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      },
      terminalLauncher: {
        launch: vi.fn().mockResolvedValue({ ok: true, pid: 9999 }),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['launch:run']({
      projectName: 'my-proj',
      projectPath: tmpDir,
      continueSession: false,
    })
    expect(result.ok).toBe(true)
    expect(result.pid).toBe(9999)
    expect(deps.commandLocator.getPreferredShell).toHaveBeenCalledOnce()
    expect(deps.commandLocator.findWindowsTerminal).toHaveBeenCalledOnce()
    expect(deps.terminalLauncher.launch).toHaveBeenCalledOnce()
  })

  it('spec filePath is the resolved shell, not "claude"', async () => {
    let captured: import('../../../src/core/models').LaunchSpec | null = null
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('pwsh'),
      },
      terminalLauncher: {
        launch: vi.fn().mockImplementation(async (s) => { captured = s; return { ok: true, pid: 1 } }),
      },
    })
    const handlers = createHandlers(deps)

    await handlers['launch:run']({ projectName: 'p', projectPath: tmpDir, continueSession: false })
    expect(captured).not.toBeNull()
    expect(captured!.filePath).toBe('pwsh')
    expect(captured!.filePath).not.toBe('claude')
  })

  it('throws when projectName is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({ projectPath: tmpDir, continueSession: false })).rejects.toThrow()
  })

  it('throws when projectPath is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({ projectName: 'x', continueSession: false })).rejects.toThrow()
  })

  it('throws when continueSession is not a boolean', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({ projectName: 'x', projectPath: tmpDir, continueSession: 'no' })).rejects.toThrow()
  })

  it('throws on empty payload', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({})).rejects.toThrow()
  })

  it('records usage (lastUsed + recentLaunches) on a successful launch', async () => {
    const deps = makeDeps({
      terminalLauncher: { launch: vi.fn().mockResolvedValue({ ok: true, pid: 1 }) },
    })
    const handlers = createHandlers(deps)

    await handlers['launch:run']({ projectName: 'p', projectPath: tmpDir, continueSession: false })

    const state = await handlers['state:read']()
    expect(state.recentLaunches).toContain(tmpDir)
    const config = await handlers['config:read']()
    expect(config.projects?.[tmpDir]?.lastUsed).toBeTruthy()
  })

  it('does not record usage when recordUsage=false (worktree launches)', async () => {
    const deps = makeDeps({
      terminalLauncher: { launch: vi.fn().mockResolvedValue({ ok: true, pid: 1 }) },
    })
    const handlers = createHandlers(deps)

    await handlers['launch:run']({
      projectName: 'p',
      projectPath: tmpDir,
      continueSession: false,
      recordUsage: false,
    })

    const state = await handlers['state:read']()
    expect(state.recentLaunches).not.toContain(tmpDir)
  })

  it('does not record usage when the launch fails', async () => {
    const deps = makeDeps({
      terminalLauncher: { launch: vi.fn().mockResolvedValue({ ok: false, error: 'nope' }) },
    })
    const handlers = createHandlers(deps)

    await handlers['launch:run']({ projectName: 'p', projectPath: tmpDir, continueSession: false })

    const state = await handlers['state:read']()
    expect(state.recentLaunches).not.toContain(tmpDir)
  })
})

// ---------------------------------------------------------------------------
// env:read / env:write
// ---------------------------------------------------------------------------

describe('env:read', () => {
  it('returns null for missing env file', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['env:read']({ path: path.join(tmpDir, '.env') })
    expect(result).toBeNull()
  })

  it('returns file contents for existing env file', async () => {
    const envPath = path.join(tmpDir, '.env')
    await fs.writeFile(envPath, 'FOO=bar\nBAZ=qux', 'utf8')

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['env:read']({ path: envPath })
    expect(result).toContain('FOO=bar')
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['env:read']({})).rejects.toThrow()
  })
})

describe('env:write', () => {
  it('writes contents to env file', async () => {
    const envPath = path.join(tmpDir, '.env')
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    await handlers['env:write']({ path: envPath, contents: 'KEY=value' })

    const result = await fs.readFile(envPath, 'utf8')
    expect(result).toBe('KEY=value')
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['env:write']({ contents: 'X=1' })).rejects.toThrow()
  })

  it('throws when contents is not a string', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['env:write']({ path: path.join(tmpDir, '.env'), contents: 42 })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// mcp:read
// ---------------------------------------------------------------------------

describe('mcp:read', () => {
  it('returns empty array when .mcp.json absent', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['mcp:read']({ path: tmpDir })
    expect(result).toEqual([])
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['mcp:read']({})).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// terminals:detect
// ---------------------------------------------------------------------------

describe('terminals:detect', () => {
  it('returns an array of terminal entries', async () => {
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['terminals:detect'](undefined)
    expect(Array.isArray(result)).toBe(true)
    expect(result.every((t) => typeof t.id === 'string' && typeof t.name === 'string')).toBe(true)
  })

  it('includes Windows Terminal when wt.exe is found', async () => {
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue('C:\\wt.exe'),
        getPreferredShell: vi.fn().mockResolvedValue('pwsh'),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['terminals:detect'](undefined)
    expect(result.some((t) => t.id === 'wt')).toBe(true)
  })

  it('does not include Windows Terminal when wt.exe is not found', async () => {
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['terminals:detect'](undefined)
    expect(result.some((t) => t.id === 'wt')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// dialog:pickFolder
// ---------------------------------------------------------------------------

describe('dialog:pickFolder', () => {
  it('calls pickFolder and returns result', async () => {
    const deps = makeDeps({
      pickFolder: vi.fn().mockResolvedValue({ path: '/chosen/dir' }),
    })
    const handlers = createHandlers(deps)

    const result = await handlers['dialog:pickFolder']({ title: 'Choose' })
    expect(result).toEqual({ path: '/chosen/dir' })
    expect(deps.pickFolder).toHaveBeenCalledWith({ title: 'Choose' })
  })

  it('accepts undefined title', async () => {
    const deps = makeDeps({
      pickFolder: vi.fn().mockResolvedValue({ path: null }),
    })
    const handlers = createHandlers(deps)

    const result = await handlers['dialog:pickFolder']({})
    expect(result).toEqual({ path: null })
  })
})

// ---------------------------------------------------------------------------
// projects:create
// ---------------------------------------------------------------------------

describe('projects:create', () => {
  it('creates a folder and returns its path', async () => {
    const root = path.join(tmpDir, 'roots')
    await fs.mkdir(root)

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:create']({ root, name: 'new-proj' })
    expect(result.path).toBe(path.join(root, 'new-proj'))

    const stat = await fs.stat(result.path)
    expect(stat.isDirectory()).toBe(true)
  })

  it('throws when root is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:create']({ name: 'x' })).rejects.toThrow()
  })

  it('throws when name is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:create']({ root: tmpDir })).rejects.toThrow()
  })

  it('throws when name contains invalid characters', async () => {
    const root = path.join(tmpDir, 'roots2')
    await fs.mkdir(root)

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    await expect(handlers['projects:create']({ root, name: 'bad:name' })).rejects.toThrow()
  })

  it('throws on malformed payload (null)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:create'](null)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// projects:rename
// ---------------------------------------------------------------------------

describe('projects:rename', () => {
  it('renames the folder and returns new path', async () => {
    const projectDir = path.join(tmpDir, 'old-name')
    await fs.mkdir(projectDir)

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:rename']({ path: projectDir, newName: 'new-name' })
    expect(result.path).toBe(path.join(tmpDir, 'new-name'))

    const stat = await fs.stat(result.path)
    expect(stat.isDirectory()).toBe(true)
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:rename']({ newName: 'x' })).rejects.toThrow()
  })

  it('throws when newName is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:rename']({ path: tmpDir })).rejects.toThrow()
  })

  it('throws on malformed payload (null)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:rename'](null)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// projects:delete
// ---------------------------------------------------------------------------

describe('projects:delete', () => {
  it('permanently deletes the folder when permanent=true', async () => {
    const projectDir = path.join(tmpDir, 'to-delete')
    await fs.mkdir(projectDir)

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:delete']({ path: projectDir, permanent: true })
    expect(result.ok).toBe(true)

    const exists = await fs.stat(projectDir).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('throws when permanent=false (soft delete not yet implemented)', async () => {
    const projectDir = path.join(tmpDir, 'to-soft-delete')
    await fs.mkdir(projectDir)

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    await expect(
      handlers['projects:delete']({ path: projectDir, permanent: false }),
    ).rejects.toThrow(/soft delete not yet implemented/i)
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:delete']({ permanent: true })).rejects.toThrow()
  })

  it('throws on malformed payload (null)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:delete'](null)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// projects:claudeInfo
// ---------------------------------------------------------------------------

describe('projects:claudeInfo', () => {
  it('returns hasClaudeMd=true when CLAUDE.md exists', async () => {
    const projectDir = path.join(tmpDir, 'project-with-claude')
    await fs.mkdir(projectDir)
    await fs.writeFile(path.join(projectDir, 'CLAUDE.md'), '# Claude')

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:claudeInfo']({ path: projectDir })
    expect(result.hasClaudeMd).toBe(true)
    expect(result.claudeMdFilename).toBe('CLAUDE.md')
    expect(result.hasMcp).toBe(false)
  })

  it('returns hasClaudeMd=false when CLAUDE.md absent', async () => {
    const projectDir = path.join(tmpDir, 'project-no-claude')
    await fs.mkdir(projectDir)

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:claudeInfo']({ path: projectDir })
    expect(result.hasClaudeMd).toBe(false)
    expect(result.claudeMdFilename).toBeNull()
    expect(result.hasMcp).toBe(false)
  })

  it('returns hasMcp=true when .mcp.json has servers', async () => {
    const projectDir = path.join(tmpDir, 'project-with-mcp')
    await fs.mkdir(projectDir)
    await fs.writeFile(
      path.join(projectDir, '.mcp.json'),
      JSON.stringify({ mcpServers: { myServer: { command: 'npx', args: [] } } }),
    )

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['projects:claudeInfo']({ path: projectDir })
    expect(result.hasMcp).toBe(true)
  })

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:claudeInfo']({})).rejects.toThrow()
  })

  it('throws on malformed payload (null)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:claudeInfo'](null)).rejects.toThrow()
  })
})
