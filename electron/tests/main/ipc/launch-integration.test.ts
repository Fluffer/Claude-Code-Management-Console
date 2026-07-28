/**
 * Integration tests for the launch:run handler.
 *
 * These exercise the FULL handler path — handler → commandLocator → buildLaunchSpec →
 * terminalLauncher — asserting that:
 *   1. The handler calls commandLocator to resolve shell + WT (not raw 'claude').
 *   2. The spec passed to terminalLauncher contains the real shell and 'claude' command.
 *   3. Errors from terminalLauncher are returned (not swallowed).
 *
 * terminalLauncher is replaced with a spy so we do NOT spawn an actual process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'
import type { LaunchResult } from '../../../src/main/os/terminalLauncher'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launch-int-'))
  // Path-confined handlers (shell:openPath, openInVscode, projects:move) refuse
  // anything outside a configured source root, so declare tmpDir as one.
  await fs.writeFile(
    path.join(tmpDir, 'config.json'),
    JSON.stringify({ roots: [tmpDir], defaultRoot: null, ignore: [], hidden: [], projects: {} }),
    'utf8',
  )
})

afterEach(async () => {
  await new Promise<void>((r) => setTimeout(r, 50))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

function makeLaunchDeps(
  launchSpy: (spec: import('../../../src/core/models').LaunchSpec) => Promise<LaunchResult>,
  shellResult: string = 'powershell',
  wtResult: string | null = null,
): IpcHandlerDeps {
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
      launch: vi.fn().mockImplementation(launchSpy),
    },
    commandLocator: {
      findOnPath: vi.fn().mockResolvedValue(null),
      findWindowsTerminal: vi.fn().mockResolvedValue(wtResult),
      findTerminalPath: vi.fn().mockResolvedValue(null),
      getPreferredShell: vi.fn().mockResolvedValue(shellResult),
    },
    pickFolder: vi.fn().mockResolvedValue({ path: null }),
    openPath: vi.fn().mockResolvedValue(''),
    openExternal: vi.fn().mockResolvedValue(undefined),
    openInVscode: vi.fn().mockResolvedValue({ ok: true }),
    approver: { init: vi.fn(), status: vi.fn(), set: vi.fn(), dispose: vi.fn() } as unknown as IpcHandlerDeps['approver'],
  }
}

describe('launch:run handler — full pipeline', () => {
  it('calls commandLocator.getPreferredShell and .findWindowsTerminal before launching', async () => {
    const launchSpy = vi.fn().mockResolvedValue({ ok: true, pid: 42 })
    const deps = makeLaunchDeps(launchSpy, 'pwsh', null)
    const handlers = createHandlers(deps)

    const result = await handlers['launch:run']({
      projectName: 'my-app',
      projectPath: 'C:\\Dev\\my-app',
      continueSession: false,
    })

    expect(result.ok).toBe(true)
    expect(deps.commandLocator.getPreferredShell).toHaveBeenCalledOnce()
    expect(deps.commandLocator.findWindowsTerminal).toHaveBeenCalledOnce()
  })

  it('passes a spec using the resolved shell — not the bare string "claude"', async () => {
    let capturedSpec: import('../../../src/core/models').LaunchSpec | null = null
    const launchSpy = vi.fn().mockImplementation(async (spec) => {
      capturedSpec = spec
      return { ok: true, pid: 99 }
    })
    const deps = makeLaunchDeps(launchSpy, 'powershell', null)
    const handlers = createHandlers(deps)

    await handlers['launch:run']({
      projectName: 'test-proj',
      projectPath: 'C:\\Dev\\test-proj',
      continueSession: false,
    })

    expect(capturedSpec).not.toBeNull()
    // filePath must be the resolved shell, not 'claude'
    expect(capturedSpec!.filePath).toBe('powershell')
    expect(capturedSpec!.filePath).not.toBe('claude')
    // The arguments must contain 'claude' (the command to run inside the shell)
    expect(capturedSpec!.arguments).toContain('claude')
  })

  it('uses wt.exe as filePath when Windows Terminal is found', async () => {
    let capturedSpec: import('../../../src/core/models').LaunchSpec | null = null
    const launchSpy = vi.fn().mockImplementation(async (spec) => {
      capturedSpec = spec
      return { ok: true, pid: 77 }
    })
    const deps = makeLaunchDeps(launchSpy, 'pwsh', 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe')
    const handlers = createHandlers(deps)

    await handlers['launch:run']({
      projectName: 'wt-proj',
      projectPath: 'C:\\Dev\\wt-proj',
      continueSession: true,
    })

    expect(capturedSpec).not.toBeNull()
    expect(capturedSpec!.filePath).toContain('wt')
    // Arguments must include the shell and claude --continue
    expect(capturedSpec!.arguments).toContain('pwsh')
    expect(capturedSpec!.arguments).toContain('--continue')
  })

  it('includes --continue in the command when continueSession=true', async () => {
    let capturedSpec: import('../../../src/core/models').LaunchSpec | null = null
    const launchSpy = vi.fn().mockImplementation(async (spec) => {
      capturedSpec = spec
      return { ok: true, pid: 1 }
    })
    const deps = makeLaunchDeps(launchSpy, 'powershell', null)
    const handlers = createHandlers(deps)

    await handlers['launch:run']({
      projectName: 'cont-proj',
      projectPath: 'C:\\Dev\\cont-proj',
      continueSession: true,
    })

    expect(capturedSpec!.arguments).toContain('--continue')
  })

  it('does NOT include --continue when continueSession=false', async () => {
    let capturedSpec: import('../../../src/core/models').LaunchSpec | null = null
    const launchSpy = vi.fn().mockImplementation(async (spec) => {
      capturedSpec = spec
      return { ok: true, pid: 2 }
    })
    const deps = makeLaunchDeps(launchSpy, 'powershell', null)
    const handlers = createHandlers(deps)

    await handlers['launch:run']({
      projectName: 'new-proj',
      projectPath: 'C:\\Dev\\new-proj',
      continueSession: false,
    })

    expect(capturedSpec!.arguments).not.toContain('--continue')
  })

  it('passes flags (e.g. --resume <id>) into the command', async () => {
    let capturedSpec: import('../../../src/core/models').LaunchSpec | null = null
    const launchSpy = vi.fn().mockImplementation(async (spec) => {
      capturedSpec = spec
      return { ok: true, pid: 3 }
    })
    const deps = makeLaunchDeps(launchSpy, 'powershell', null)
    const handlers = createHandlers(deps)

    await handlers['launch:run']({
      projectName: 'resume-proj',
      projectPath: 'C:\\Dev\\resume-proj',
      continueSession: false,
      flags: '--resume abc123',
    })

    expect(capturedSpec!.arguments).toContain('--resume abc123')
  })

  it('returns { ok: false } and propagates the result when launcher fails', async () => {
    const launchSpy = vi.fn().mockResolvedValue({ ok: false, pid: undefined })
    const deps = makeLaunchDeps(launchSpy, 'powershell', null)
    const handlers = createHandlers(deps)

    const result = await handlers['launch:run']({
      projectName: 'fail-proj',
      projectPath: 'C:\\Dev\\fail-proj',
      continueSession: false,
    })

    expect(result.ok).toBe(false)
  })

  it('throws when projectName is missing', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({ projectPath: 'C:\\Dev\\x', continueSession: false })).rejects.toThrow()
  })

  it('throws when projectPath is missing', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({ projectName: 'x', continueSession: false })).rejects.toThrow()
  })

  it('throws when continueSession is not a boolean', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['launch:run']({ projectName: 'x', projectPath: 'C:\\Dev\\x', continueSession: 'yes' })).rejects.toThrow()
  })
})

describe('shell:openPath handler', () => {
  it('calls openPath and returns ok:true on success (empty string from electron)', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    deps.openPath = vi.fn().mockResolvedValue('') // electron returns '' on success
    const handlers = createHandlers(deps)

    const projectPath = path.join(tmpDir, 'myproject')
    const result = await handlers['shell:openPath']({ path: projectPath })
    expect(result.ok).toBe(true)
    expect(deps.openPath).toHaveBeenCalledWith(projectPath)
  })

  it('returns ok:false when electron returns an error string', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    deps.openPath = vi.fn().mockResolvedValue('The path does not exist')
    const handlers = createHandlers(deps)

    const result = await handlers['shell:openPath']({ path: path.join(tmpDir, 'nonexistent') })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('The path does not exist')
  })

  it('throws when path is missing', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['shell:openPath']({})).rejects.toThrow()
  })
})

describe('shell:openInVscode handler', () => {
  it('delegates to openInVscode and returns its result', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    deps.openInVscode = vi.fn().mockResolvedValue({ ok: true })
    const handlers = createHandlers(deps)

    const projectPath = path.join(tmpDir, 'project')
    const result = await handlers['shell:openInVscode']({ path: projectPath })
    expect(result.ok).toBe(true)
    expect(deps.openInVscode).toHaveBeenCalledWith(projectPath)
  })

  it('returns ok:false with error when VS Code is not found', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    deps.openInVscode = vi.fn().mockResolvedValue({ ok: false, error: 'VS Code CLI (code) not found on PATH.' })
    const handlers = createHandlers(deps)

    const result = await handlers['shell:openInVscode']({ path: path.join(tmpDir, 'project') })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('VS Code')
  })

  it('throws when path is missing', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['shell:openInVscode']({})).rejects.toThrow()
  })
})

describe('projects:move handler', () => {
  it('moves a project to a target root and returns new path', async () => {
    const projectDir = path.join(tmpDir, 'srcRoot', 'my-project')
    const targetRoot = path.join(tmpDir, 'destRoot')
    await fs.mkdir(projectDir, { recursive: true })
    await fs.mkdir(targetRoot, { recursive: true })

    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    const result = await handlers['projects:move']({ path: projectDir, targetRoot })
    expect(result.ok).toBe(true)
    expect(result.newPath).toBe(path.join(targetRoot, 'my-project'))

    const stat = await fs.stat(result.newPath)
    expect(stat.isDirectory()).toBe(true)
  })

  it('throws when path is missing', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:move']({ targetRoot: tmpDir })).rejects.toThrow()
  })

  it('throws when targetRoot is missing', async () => {
    const deps = makeLaunchDeps(vi.fn().mockResolvedValue({ ok: true }))
    const handlers = createHandlers(deps)

    // @ts-expect-error testing runtime validation
    await expect(handlers['projects:move']({ path: tmpDir })).rejects.toThrow()
  })
})
