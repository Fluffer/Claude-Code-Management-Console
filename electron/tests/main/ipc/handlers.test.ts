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
  // Handlers that write, delete, execute or shell-open a path refuse anything
  // outside a configured source root, so declare tmpDir as one up front.
  await fs.writeFile(
    path.join(tmpDir, 'config.json'),
    JSON.stringify({ roots: [tmpDir], defaultRoot: null, ignore: [], hidden: [], projects: {} }),
    'utf8',
  )
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// config:read
// ---------------------------------------------------------------------------

describe('config:read', () => {
  it('returns default config when file is absent and writes it (first-run)', async () => {
    const deps = makeDeps()
    // This case is specifically about there being no config yet, so drop the
    // root-seeding config the shared beforeEach writes.
    await fs.rm(deps.configPath, { force: true })
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
  /** A pid must be a currently-tracked Claude session before it can be killed. */
  function trackedSession(pid: number): Partial<IpcHandlerDeps> {
    return {
      processInspector: {
        findAllProcesses: vi.fn().mockResolvedValue([]),
        findClaudeSessions: vi.fn().mockResolvedValue([
          { pid, processName: 'claude', workingDirectory: tmpDir },
        ]),
      },
    }
  }

  it('calls sessionKiller.kill and returns { ok: true } on success', async () => {
    const deps = makeDeps(trackedSession(5678))
    const handlers = createHandlers(deps)

    const result = await handlers['sessions:kill']({ pid: 5678 })
    expect(result).toEqual({ ok: true })
    expect(deps.sessionKiller.kill).toHaveBeenCalledWith(5678)
  })

  it('returns { ok: false } when killer returns false', async () => {
    const deps = makeDeps({
      ...trackedSession(999),
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
        findTerminalPath: vi.fn().mockResolvedValue(null),
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

  // Every launch path in the app funnels through launch:run, so the app-wide
  // permission-mode default is applied here or nowhere.
  describe('default permission mode', () => {
    async function captureFlags(
      stateJson: string | null,
      requestFlags?: string,
    ): Promise<string> {
      const statePath = makeStatePath()
      if (stateJson !== null) await fs.writeFile(statePath, stateJson, 'utf8')
      let captured = ''
      const deps = makeDeps({
        statePath,
        terminalLauncher: {
          launch: vi.fn().mockImplementation((spec: { arguments: string }) => {
            captured = spec.arguments
            return Promise.resolve({ ok: true, pid: 1 })
          }),
        },
      })
      const handlers = createHandlers(deps)
      await handlers['launch:run']({
        projectName: 'p',
        projectPath: tmpDir,
        continueSession: false,
        ...(requestFlags !== undefined ? { flags: requestFlags } : {}),
      })
      return captured
    }

    it('applies the configured default when the project sets none', async () => {
      const flags = await captureFlags('{"defaultPermissionMode":"auto"}')
      expect(flags).toContain('--permission-mode auto')
    })

    it('leaves a project that already picked a mode alone', async () => {
      const flags = await captureFlags('{"defaultPermissionMode":"auto"}', '--permission-mode plan')
      expect(flags).toContain('--permission-mode plan')
      expect(flags).not.toContain('--permission-mode auto')
    })

    it('adds nothing when the default is blank', async () => {
      const flags = await captureFlags('{"defaultPermissionMode":""}')
      expect(flags).not.toContain('--permission-mode')
    })

    it('defaults to auto for a state file that predates the setting', async () => {
      const flags = await captureFlags('{"theme":"System"}')
      expect(flags).toContain('--permission-mode auto')
    })

    it('falls back to the app default when state is corrupt', async () => {
      // loadState treats corrupt state as "not precious" and returns defaults
      // rather than throwing (stateStore.ts), so this lands on the same 'auto'
      // a fresh install gets — not on the no-default path.
      const flags = await captureFlags('{ not json')
      expect(flags).toContain('--permission-mode auto')
    })
  })

  it('spec filePath is the resolved shell, not "claude"', async () => {
    let captured: import('../../../src/core/models').LaunchSpec | null = null
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        findTerminalPath: vi.fn().mockResolvedValue(null),
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
// git:addWorktree
// ---------------------------------------------------------------------------

describe('git:addWorktree', () => {
  it('throws when branch is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:addWorktree']({ repoPath: tmpDir })).rejects.toThrow()
  })

  it('throws when repoPath is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:addWorktree']({ branch: 'x' })).rejects.toThrow()
  })

  it('throws when branch is blank', async () => {
    const handlers = createHandlers(makeDeps())
    await expect(handlers['git:addWorktree']({ repoPath: tmpDir, branch: '   ' })).rejects.toThrow()
  })

  it('returns ok=false for a non-git repoPath (no throw)', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['git:addWorktree']({ repoPath: tmpDir, branch: 'feat/x' })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  }, 20000)
})

// ---------------------------------------------------------------------------
// terminals:detect
// ---------------------------------------------------------------------------

describe('terminals:detect', () => {
  it('returns only available OS-appropriate terminals with resolved paths', async () => {
    if (process.platform !== 'win32') return
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue('C:\\wt.exe'),
        // wt.exe resolves; wtai.exe does not
        findTerminalPath: vi.fn().mockImplementation(async (exe: string) =>
          exe === 'wt.exe' ? 'C:\\wt.exe' : null,
        ),
        getPreferredShell: vi.fn().mockResolvedValue('pwsh'),
      },
    })
    const handlers = createHandlers(deps)
    const result = await handlers['terminals:detect']()
    expect(result).toEqual([{ id: 'wt', name: 'Windows Terminal', path: 'C:\\wt.exe' }])
  })
})

// ---------------------------------------------------------------------------
// env:read / env:write
// ---------------------------------------------------------------------------

// The request carries the PROJECT path; main resolves <project>/.env itself.
describe('env:read', () => {
  it('returns an empty string when the project has no .env', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['env:read']({ path: tmpDir })
    expect(result).toBe('')
  })

  it('returns the .env contents for a project that has one', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'FOO=bar\nBAZ=qux', 'utf8')

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['env:read']({ path: tmpDir })
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
  it('writes contents to the project .env file', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    await handlers['env:write']({ path: tmpDir, contents: 'KEY=value' })

    const result = await fs.readFile(path.join(tmpDir, '.env'), 'utf8')
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

describe('terminals:detect (availability)', () => {
  it('returns an array of {id,name,path} entries', async () => {
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        findTerminalPath: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['terminals:detect'](undefined)
    expect(Array.isArray(result)).toBe(true)
    expect(
      result.every(
        (t) => typeof t.id === 'string' && typeof t.name === 'string' && typeof t.path === 'string',
      ),
    ).toBe(true)
  })

  it('includes Windows Terminal when wt.exe is found', async () => {
    if (process.platform !== 'win32') return
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue('C:\\wt.exe'),
        findTerminalPath: vi.fn().mockImplementation(async (exe: string) =>
          exe === 'wt.exe' ? 'C:\\wt.exe' : null,
        ),
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
        findTerminalPath: vi.fn().mockResolvedValue(null),
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

// ---------------------------------------------------------------------------
// git:clone
// ---------------------------------------------------------------------------

describe('git:clone', () => {
  it('throws when url is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:clone']({ targetRoot: tmpDir, name: 'repo' })).rejects.toThrow()
  })

  it('throws when targetRoot is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:clone']({ url: 'https://x.com/r.git', name: 'repo' })).rejects.toThrow()
  })

  it('throws when name is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:clone']({ url: 'https://x.com/r.git', targetRoot: tmpDir })).rejects.toThrow()
  })

  it('returns ok=false when name is invalid (validateCloneName rejects)', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['git:clone']({
      url: 'https://x.com/r.git',
      targetRoot: tmpDir,
      name: 'bad:name',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns ok=false when name is empty', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['git:clone']({
      url: 'https://x.com/r.git',
      targetRoot: tmpDir,
      name: '',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns ok=false when name contains a path separator', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['git:clone']({
      url: 'https://x.com/r.git',
      targetRoot: tmpDir,
      name: 'sub/dir',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns ok=false (no throw) when targetDir already exists', async () => {
    const existingDir = path.join(tmpDir, 'existing-repo')
    await fs.mkdir(existingDir)

    const deps = makeDeps()
    const handlers = createHandlers(deps)
    // seed config so tmpDir is a known root
    const cfg = createDefaultConfig()
    cfg.roots = [tmpDir]
    await handlers['config:write'](cfg)

    const result = await handlers['git:clone']({
      url: 'https://x.com/r.git',
      targetRoot: tmpDir,
      name: 'existing-repo',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already exists/i)
  })

  it('returns ok=false when URL starts with "-" (option-injection guard)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)
    const cfg = createDefaultConfig()
    cfg.roots = [tmpDir]
    await handlers['config:write'](cfg)

    const result = await handlers['git:clone']({
      url: '--upload-pack=evil',
      targetRoot: tmpDir,
      name: 'repo',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/invalid repository url/i)
  })

  it('returns ok=false when targetRoot is not in configured roots', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)
    // Replace the seeded config so the target really is unconfigured.
    await handlers['config:write'](createDefaultConfig())
    const result = await handlers['git:clone']({
      url: 'https://x.com/r.git',
      targetRoot: tmpDir,
      name: 'repo',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not a configured source root/i)
  })

  it('returns ok=false when name is ".." (traversal guard in handler)', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)
    const cfg = createDefaultConfig()
    cfg.roots = [tmpDir]
    await handlers['config:write'](cfg)

    const result = await handlers['git:clone']({
      url: 'https://x.com/r.git',
      targetRoot: tmpDir,
      name: '..',
    })
    expect(result.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// git:commit
// ---------------------------------------------------------------------------

describe('git:commit', () => {
  it('throws when path is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:commit']({ message: 'msg', push: false })).rejects.toThrow()
  })

  it('throws when message is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:commit']({ path: tmpDir, push: false })).rejects.toThrow()
  })

  it('throws when push is not a boolean', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:commit']({ path: tmpDir, message: 'msg', push: 'yes' })).rejects.toThrow()
  })

  it('returns ok=false (no throw) for a non-git directory', async () => {
    const handlers = createHandlers(makeDeps())
    const result = await handlers['git:commit']({ path: tmpDir, message: 'msg', push: false })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  }, 15000)
})

// ---------------------------------------------------------------------------
// mcp:health
// ---------------------------------------------------------------------------

describe('mcp:health', () => {
  it('returns empty array when .mcp.json is absent', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['mcp:health']({ path: tmpDir })
    expect(result).toEqual([])
  })

  it('returns a HealthResult for a valid stdio server entry', async () => {
    const projectDir = path.join(tmpDir, 'project-with-mcp-health')
    await fs.mkdir(projectDir)
    await fs.writeFile(
      path.join(projectDir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'node-probe': { command: 'node', args: ['-e', ''] },
        },
      }),
    )

    const deps = makeDeps()
    const handlers = createHandlers(deps)

    const result = await handlers['mcp:health']({ path: projectDir })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('node-probe')
    expect(['ok', 'failed']).toContain(result[0].status)
    expect(typeof result[0].detail === 'string' || result[0].detail === null).toBe(true)
  }, 10000)

  it('throws when path is missing', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['mcp:health']({})).rejects.toThrow()
  })

  it('throws when path is not a string', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['mcp:health']({ path: 42 })).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// git:openPr
// ---------------------------------------------------------------------------

describe('git:openPr', () => {
  it('throws when path is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:openPr']({ title: 'PR title' })).rejects.toThrow()
  })

  it('throws when title is missing', async () => {
    const handlers = createHandlers(makeDeps())
    // @ts-expect-error testing runtime validation
    await expect(handlers['git:openPr']({ path: tmpDir })).rejects.toThrow()
  })

  it('returns ok=false with gh-not-found message when findOnPath returns null', async () => {
    const deps = makeDeps({
      commandLocator: {
        findOnPath: vi.fn().mockResolvedValue(null),
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        findTerminalPath: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      },
    })
    const handlers = createHandlers(deps)

    const result = await handlers['git:openPr']({ path: tmpDir, title: 'Test PR' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/gh/i)
    expect(result.error).toMatch(/not found/i)
  })

  it('calls findOnPath with "gh" to locate the GitHub CLI', async () => {
    const findOnPath = vi.fn().mockResolvedValue(null)
    const deps = makeDeps({
      commandLocator: {
        findOnPath,
        findWindowsTerminal: vi.fn().mockResolvedValue(null),
        findTerminalPath: vi.fn().mockResolvedValue(null),
        getPreferredShell: vi.fn().mockResolvedValue('powershell'),
      },
    })
    const handlers = createHandlers(deps)

    await handlers['git:openPr']({ path: tmpDir, title: 'Test PR' })
    expect(findOnPath).toHaveBeenCalledWith('gh')
  })
})
