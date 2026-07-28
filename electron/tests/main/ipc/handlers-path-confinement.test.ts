/**
 * Confinement tests for the IPC channels that write, delete, execute, or hand
 * a path to the OS shell. Each must refuse a path outside the user's
 * configured source roots, and must still accept a legitimate project path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import { saveConfig } from '../../../src/main/services/configStore'
import { createDefaultConfig } from '../../../src/core/config/configSerialization'
import { OUTSIDE_ROOTS_MESSAGE } from '../../../src/core/projects/pathGuard'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let tmpDir: string
let root: string
let projectPath: string
let outsidePath: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'confinement-'))
  root = path.join(tmpDir, 'Active')
  projectPath = path.join(root, 'proj')
  outsidePath = path.join(tmpDir, 'Secrets')
  await fs.mkdir(projectPath, { recursive: true })
  await fs.mkdir(outsidePath, { recursive: true })
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

async function seedRoots(deps: IpcHandlerDeps): Promise<void> {
  await saveConfig(deps.configPath, { ...createDefaultConfig(), roots: [root] })
}

describe('env:read / env:write', () => {
  it('reads <project>/.env, not the project directory', async () => {
    const deps = makeDeps()
    await seedRoots(deps)
    await fs.writeFile(path.join(projectPath, '.env'), 'API_KEY=secret\n', 'utf8')

    const handlers = createHandlers(deps)
    expect(await handlers['env:read']({ path: projectPath })).toBe('API_KEY=secret\n')
  })

  it('returns empty string when the project has no .env', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    expect(await handlers['env:read']({ path: projectPath })).toBe('')
  })

  it('writes <project>/.env', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await handlers['env:write']({ path: projectPath, contents: 'A=1\n' })

    expect(await fs.readFile(path.join(projectPath, '.env'), 'utf8')).toBe('A=1\n')
  })

  it('refuses to read outside the configured roots', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(handlers['env:read']({ path: outsidePath })).rejects.toThrow(OUTSIDE_ROOTS_MESSAGE)
  })

  it('refuses to write outside the configured roots', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(
      handlers['env:write']({ path: outsidePath, contents: 'PWNED=1' }),
    ).rejects.toThrow(OUTSIDE_ROOTS_MESSAGE)
    await expect(fs.access(path.join(outsidePath, '.env'))).rejects.toThrow()
  })

  it('refuses a traversal that escapes a root', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(
      handlers['env:read']({ path: path.join(projectPath, '..', '..', 'Secrets') }),
    ).rejects.toThrow(OUTSIDE_ROOTS_MESSAGE)
  })
})

describe('shell:openPath', () => {
  it('opens a project path', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    expect(await handlers['shell:openPath']({ path: projectPath })).toEqual({ ok: true })
    expect(deps.openPath).toHaveBeenCalledWith(projectPath)
  })

  it('refuses a path outside the roots and never calls the shell', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(handlers['shell:openPath']({ path: 'C:\\Windows\\System32\\calc.exe' })).rejects.toThrow(
      OUTSIDE_ROOTS_MESSAGE,
    )
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('routes an http(s) URL to the browser instead of the shell', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    const result = await handlers['shell:openPath']({
      path: 'https://github.com/owner/repo/pull/7',
    })

    expect(result).toEqual({ ok: true })
    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/owner/repo/pull/7')
    expect(deps.openPath).not.toHaveBeenCalled()
  })

  it('does not treat a non-http scheme as a URL', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(handlers['shell:openPath']({ path: 'file:///C:/Windows' })).rejects.toThrow(
      OUTSIDE_ROOTS_MESSAGE,
    )
    expect(deps.openExternal).not.toHaveBeenCalled()
  })
})

describe('shell:openInVscode', () => {
  it('refuses a path outside the roots', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(handlers['shell:openInVscode']({ path: outsidePath })).rejects.toThrow(
      OUTSIDE_ROOTS_MESSAGE,
    )
    expect(deps.openInVscode).not.toHaveBeenCalled()
  })

  it('allows a project subfolder', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await handlers['shell:openInVscode']({ path: path.join(projectPath, '.claude', 'commands') })
    expect(deps.openInVscode).toHaveBeenCalled()
  })
})

describe('destructive handlers reject a source root itself', () => {
  it('projects:delete refuses a configured root', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(handlers['projects:delete']({ path: root, permanent: true })).rejects.toThrow(
      OUTSIDE_ROOTS_MESSAGE,
    )
    // The root and its project survive.
    await fs.access(projectPath)
  })

  it('projects:delete refuses a path outside the roots', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(
      handlers['projects:delete']({ path: outsidePath, permanent: true }),
    ).rejects.toThrow(OUTSIDE_ROOTS_MESSAGE)
    await fs.access(outsidePath)
  })

  it('projects:rename refuses a path outside the roots', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(
      handlers['projects:rename']({ path: outsidePath, newName: 'taken-over' }),
    ).rejects.toThrow(OUTSIDE_ROOTS_MESSAGE)
  })

  it('projects:delete still deletes a real project', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    expect(await handlers['projects:delete']({ path: projectPath, permanent: true })).toEqual({
      ok: true,
    })
    await expect(fs.access(projectPath)).rejects.toThrow()
  })
})

describe('mcp:health', () => {
  it('refuses a project outside the roots rather than executing its commands', async () => {
    const deps = makeDeps()
    await seedRoots(deps)
    await fs.writeFile(
      path.join(outsidePath, '.mcp.json'),
      JSON.stringify({ mcpServers: { evil: { command: 'calc.exe', args: [] } } }),
      'utf8',
    )

    const handlers = createHandlers(deps)
    await expect(handlers['mcp:health']({ path: outsidePath })).rejects.toThrow(
      OUTSIDE_ROOTS_MESSAGE,
    )
  })
})

describe('sessions:kill', () => {
  it('refuses a pid the app does not report as a Claude session', async () => {
    const deps = makeDeps()
    const handlers = createHandlers(deps)

    expect(await handlers['sessions:kill']({ pid: 4 })).toEqual({ ok: false })
    expect(deps.sessionKiller.kill).not.toHaveBeenCalled()
  })

  it('kills a pid that is a tracked Claude session', async () => {
    const deps = makeDeps({
      processInspector: {
        findAllProcesses: vi.fn().mockResolvedValue([]),
        findClaudeSessions: vi.fn().mockResolvedValue([
          { pid: 4242, processName: 'claude', workingDirectory: projectPath },
        ]),
      },
    })
    const handlers = createHandlers(deps)

    expect(await handlers['sessions:kill']({ pid: 4242 })).toEqual({ ok: true })
    expect(deps.sessionKiller.kill).toHaveBeenCalledWith(4242)
  })
})

describe('git:addWorktree', () => {
  it('refuses a branch name that would be read as a git option', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    const result = await handlers['git:addWorktree']({
      repoPath: projectPath,
      branch: '--upload-pack=calc.exe',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('may not start with')
  })

  it('refuses a repo outside the roots', async () => {
    const deps = makeDeps()
    await seedRoots(deps)

    const handlers = createHandlers(deps)
    await expect(
      handlers['git:addWorktree']({ repoPath: outsidePath, branch: 'feature' }),
    ).rejects.toThrow(OUTSIDE_ROOTS_MESSAGE)
  })
})
