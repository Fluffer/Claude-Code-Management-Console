/**
 * Pure IPC handler map — no Electron import.
 * Unit-testable with injected deps.
 */
import type { IpcMap } from '../../shared/ipc'
import type { IProcessInspector } from '../os/processInspector'
import type { ISessionKiller } from '../os/sessionKiller'
import type { ITerminalLauncher } from '../os/terminalLauncher'
import type { ICommandLocator } from '../os/commandLocator'
import { loadConfig, saveConfig } from '../services/configStore'
import { loadState, saveState } from '../services/stateStore'
import { scanProjects } from '../services/projectScanner'
import { listSessions } from '../services/claudeSessionStore'
import { getBranchInfo, getIsDirty, getWorktrees, addWorktree } from '../services/gitRunner'
import { readEnv, writeEnv } from '../services/envFileStore'
import { readMcp } from '../services/mcpStore'
import { createProjectFolder } from '../services/projectFolderCreator'
import { renameProject, moveProjectToRoot } from '../services/projectMover'
import { deleteProject } from '../services/projectDeleter'
import { claudeMdPath, hasClaudeMdInProject } from '../services/projectClaudeStore'
import { resolveProjectModel } from '../services/projectModelStore'
import { buildLaunchSpec } from '../../core/launch/launchCommandBuilder'
import { terminalsForPlatform, WINDOWS_TERMINAL_EXE } from '../../core/launch/terminals'
import { mruAdd } from '../../core/projects/mruList'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface IpcHandlerDeps {
  configPath: string
  statePath: string
  /** Base directory of the .claude folder (e.g. ~/.claude). */
  claudeDir: string
  processInspector: IProcessInspector
  sessionKiller: ISessionKiller
  terminalLauncher: ITerminalLauncher
  commandLocator: ICommandLocator
  /** Injected from register.ts (electron dialog). Not exposed here. */
  pickFolder: (req: { title?: string }) => Promise<{ path: string | null }>
  /** Injected from register.ts — opens a file or folder with the default app. */
  openPath: (filePath: string) => Promise<string>
  /** Injected from register.ts — spawns `code <path>`. */
  openInVscode: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  /** Called when the renderer signals its IPC subscriptions are live. */
  onRendererReady?: () => void
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`IPC validation: '${name}' must be a string, got ${typeof value}`)
  }
  return value
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`IPC validation: '${name}' must be a number, got ${typeof value}`)
  }
  return value
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`IPC validation: '${name}' must be a non-null object`)
  }
  return value as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Handler map factory
// ---------------------------------------------------------------------------

export type HandlerMap = {
  [C in keyof IpcMap]: (
    req: IpcMap[C]['req'],
  ) => Promise<IpcMap[C]['res']>
}

export function createHandlers(deps: IpcHandlerDeps): HandlerMap {
  const {
    configPath,
    statePath,
    claudeDir,
    processInspector,
    sessionKiller,
    terminalLauncher,
    commandLocator,
    pickFolder,
    openPath,
    openInVscode,
    onRendererReady,
  } = deps

  /**
   * Record a successful launch: stamp config.projects[path].lastUsed (preserving
   * flags) and push the path onto state.recentLaunches (MRU, cap 15).
   * Mirrors MainViewModel.LaunchWithFlagsAsync → UpdateUsage + PushRecent.
   */
  async function recordLaunchUsage(projectPath: string): Promise<void> {
    const config = await loadConfig(configPath)
    const projects = { ...(config.projects ?? {}) }
    const usage = projects[projectPath] ?? { lastUsed: null, flags: null }
    projects[projectPath] = { ...usage, lastUsed: new Date().toISOString() }
    await saveConfig(configPath, { ...config, projects })

    const state = await loadState(statePath)
    await saveState(statePath, {
      ...state,
      recentLaunches: mruAdd(state.recentLaunches, projectPath, 15),
    })
  }

  /**
   * Resolve the user's selected terminal from state.json into { id, path } for
   * buildLaunchSpec, or null for Auto / unavailable / non-Windows. Never throws.
   */
  async function resolveSelectedTerminal(): Promise<{ id: string; path: string } | null> {
    if (process.platform !== 'win32') return null
    let terminalId = ''
    try {
      terminalId = (await loadState(statePath)).terminalId ?? ''
    } catch {
      return null
    }
    if (!terminalId) return null
    const exe = WINDOWS_TERMINAL_EXE[terminalId]
    if (!exe) return null
    const resolved = await commandLocator.findTerminalPath(exe)
    return resolved !== null ? { id: terminalId, path: resolved } : null
  }

  return {
    // -----------------------------------------------------------------------
    // config:read
    // First-run: if file is absent, write the default first (PowerShell-launcher interop).
    // -----------------------------------------------------------------------
    'config:read': async () => {
      const config = await loadConfig(configPath)
      // First-run write: if file was missing loadConfig returns the default without
      // writing it. We need to persist it so PowerShell-launcher interop finds it.
      const { access } = await import('node:fs/promises')
      const fileExists = await access(configPath).then(() => true).catch(() => false)
      if (!fileExists) {
        await saveConfig(configPath, config)
      }
      return config
    },

    // -----------------------------------------------------------------------
    // config:write
    // -----------------------------------------------------------------------
    'config:write': async (req) => {
      requireObject(req, 'config')
      await saveConfig(configPath, req)
    },

    // -----------------------------------------------------------------------
    // state:read
    // -----------------------------------------------------------------------
    'state:read': async () => {
      return loadState(statePath)
    },

    // -----------------------------------------------------------------------
    // state:write
    // -----------------------------------------------------------------------
    'state:write': async (req) => {
      requireObject(req, 'state')
      await saveState(statePath, req)
    },

    // -----------------------------------------------------------------------
    // projects:scan
    // -----------------------------------------------------------------------
    'projects:scan': async (req) => {
      const obj = requireObject(req, 'req')
      const root = requireString(obj['root'], 'root')

      // Build a minimal config scoped to the requested root
      const config = await loadConfig(configPath)
      const rootConfig = { ...config, roots: [root] }
      return scanProjects(rootConfig)
    },

    // -----------------------------------------------------------------------
    // projects:create
    // -----------------------------------------------------------------------
    'projects:create': async (req) => {
      const obj = requireObject(req, 'req')
      const root = requireString(obj['root'], 'root')
      const name = requireString(obj['name'], 'name')
      const newPath = await createProjectFolder(root, name)
      return { path: newPath }
    },

    // -----------------------------------------------------------------------
    // projects:rename
    // -----------------------------------------------------------------------
    'projects:rename': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      const newName = requireString(obj['newName'], 'newName')
      const newPath = await renameProject(projectPath, newName)
      return { path: newPath }
    },

    // -----------------------------------------------------------------------
    // projects:delete
    // -----------------------------------------------------------------------
    'projects:delete': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      const permanent = obj['permanent']
      if (typeof permanent !== 'boolean') {
        throw new TypeError(`IPC validation: 'permanent' must be a boolean, got ${typeof permanent}`)
      }
      if (!permanent) {
        throw new Error(
          'Soft delete not yet implemented: Recycle Bin support requires a native addon. ' +
          'Check the "Permanently delete" checkbox to permanently remove the folder.',
        )
      }
      await deleteProject(projectPath)
      return { ok: true }
    },

    // -----------------------------------------------------------------------
    // projects:claudeInfo
    // -----------------------------------------------------------------------
    'projects:claudeInfo': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      const [hasClaude, mdPath, mcpServers, defaultModel] = await Promise.all([
        hasClaudeMdInProject(projectPath),
        claudeMdPath(projectPath),
        readMcp(projectPath),
        resolveProjectModel(projectPath, path.join(claudeDir, 'settings.json')),
      ])
      const filename = mdPath !== null ? mdPath.split(/[\\/]/).pop() ?? null : null
      return {
        hasClaudeMd: hasClaude,
        claudeMdFilename: filename,
        hasMcp: mcpServers.length > 0,
        defaultModel,
      }
    },

    // -----------------------------------------------------------------------
    // sessions:listHistory
    // -----------------------------------------------------------------------
    'sessions:listHistory': async (req) => {
      const projectPath = (req as { projectPath?: string }).projectPath
      if (projectPath !== undefined) {
        requireString(projectPath, 'projectPath')
        return listSessions(projectPath, claudeDir)
      }
      // No projectPath — return empty (global history not yet implemented)
      return []
    },

    // -----------------------------------------------------------------------
    // sessions:listRunning
    // -----------------------------------------------------------------------
    'sessions:listRunning': async () => {
      return processInspector.findClaudeSessions()
    },

    // -----------------------------------------------------------------------
    // sessions:kill
    // -----------------------------------------------------------------------
    'sessions:kill': async (req) => {
      const obj = requireObject(req, 'req')
      const pid = requireNumber(obj['pid'], 'pid')
      if (!Number.isInteger(pid) || pid <= 0) {
        throw new RangeError(`IPC validation: 'pid' must be a positive integer, got ${pid}`)
      }
      const ok = await sessionKiller.kill(pid)
      return { ok }
    },

    // -----------------------------------------------------------------------
    // git:info
    // -----------------------------------------------------------------------
    'git:info': async (req) => {
      const obj = requireObject(req, 'req')
      const repoPath = requireString(obj['path'], 'path')

      const [branch, isDirty] = await Promise.all([
        getBranchInfo(repoPath),
        getIsDirty(repoPath),
      ])

      return {
        branch: branch ?? '',
        isDirty,
      }
    },

    // -----------------------------------------------------------------------
    // git:worktrees
    // -----------------------------------------------------------------------
    'git:worktrees': async (req) => {
      const obj = requireObject(req, 'req')
      const repoPath = requireString(obj['path'], 'path')
      return getWorktrees(repoPath)
    },

    // -----------------------------------------------------------------------
    // git:addWorktree — create a new worktree + branch off HEAD (sibling path)
    // -----------------------------------------------------------------------
    'git:addWorktree': async (req) => {
      const obj = requireObject(req, 'req')
      const repoPath = requireString(obj['repoPath'], 'repoPath')
      const branch = requireString(obj['branch'], 'branch')
      if (branch.trim().length === 0) {
        throw new TypeError(`IPC validation: 'branch' must be a non-empty string`)
      }
      return addWorktree(repoPath, branch)
    },

    // -----------------------------------------------------------------------
    // launch:run
    // Resolves shell + wt.exe in main, builds a full LaunchSpec via
    // buildLaunchSpec, then spawns. Errors are returned (never swallowed).
    // -----------------------------------------------------------------------
    'launch:run': async (req) => {
      const obj = requireObject(req, 'req')
      const projectName = requireString(obj['projectName'], 'projectName')
      const projectPath = requireString(obj['projectPath'], 'projectPath')
      if (typeof obj['continueSession'] !== 'boolean') {
        throw new TypeError(`IPC validation: 'continueSession' must be a boolean`)
      }
      const continueSession = obj['continueSession'] as boolean
      const flags = typeof obj['flags'] === 'string' ? obj['flags'] : ''
      const initialPrompt =
        obj['initialPrompt'] === null || obj['initialPrompt'] === undefined
          ? null
          : requireString(obj['initialPrompt'], 'initialPrompt')

      const [shell, wtPath] = await Promise.all([
        commandLocator.getPreferredShell(),
        commandLocator.findWindowsTerminal(),
      ])

      // Resolve the user's selected terminal (state.terminalId). '' = Auto, which
      // keeps the wtPath/shell default. An unavailable selection silently falls
      // back to the default too.
      const selectedTerminal = await resolveSelectedTerminal()

      const spec = buildLaunchSpec({
        projectName,
        projectPath,
        flags,
        continueSession,
        shell,
        wtPath,
        initialPrompt,
        terminal: selectedTerminal,
      })

      const result = await terminalLauncher.launch(spec)

      // Record usage on success unless explicitly opted out (worktree launches).
      // Mirrors MainViewModel.LaunchWithFlagsAsync: UpdateUsage + PushRecent.
      if (result.ok && obj['recordUsage'] !== false) {
        await recordLaunchUsage(projectPath)
      }

      return {
        ok: result.ok,
        pid: result.pid,
        error: result.ok ? undefined : result.error ?? 'Launch failed',
      }
    },

    // -----------------------------------------------------------------------
    // env:read
    // -----------------------------------------------------------------------
    'env:read': async (req) => {
      const obj = requireObject(req, 'req')
      const envPath = requireString(obj['path'], 'path')
      const contents = await readEnv(envPath)
      return contents as string
    },

    // -----------------------------------------------------------------------
    // env:write
    // -----------------------------------------------------------------------
    'env:write': async (req) => {
      const obj = requireObject(req, 'req')
      const envPath = requireString(obj['path'], 'path')
      const contents = requireString(obj['contents'], 'contents')
      await writeEnv(envPath, contents)
    },

    // -----------------------------------------------------------------------
    // mcp:read
    // -----------------------------------------------------------------------
    'mcp:read': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      return readMcp(projectPath)
    },

    // -----------------------------------------------------------------------
    // terminals:detect
    // -----------------------------------------------------------------------
    'terminals:detect': async () => {
      // Only terminals that are available AND match the current OS. The raw shell
      // is intentionally not listed — it is the silent fallback, not a choice.
      const platform = process.platform === 'win32' ? 'win32' : 'darwin'
      const detected: { id: string; name: string; path: string }[] = []

      for (const t of terminalsForPlatform(platform)) {
        const exe = WINDOWS_TERMINAL_EXE[t.id]
        if (!exe) continue // mac detection lands in Phase 3
        const resolved = await commandLocator.findTerminalPath(exe)
        if (resolved !== null) {
          detected.push({ id: t.id, name: t.name, path: resolved })
        }
      }

      return detected
    },

    // -----------------------------------------------------------------------
    // dialog:pickFolder
    // Delegates to injected pickFolder (implemented with electron dialog in register.ts).
    // -----------------------------------------------------------------------
    'dialog:pickFolder': async (req) => {
      return pickFolder(req ?? {})
    },

    // -----------------------------------------------------------------------
    // projects:move
    // Moves a project to a different root directory.
    // -----------------------------------------------------------------------
    'projects:move': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      const targetRoot = requireString(obj['targetRoot'], 'targetRoot')
      const newPath = await moveProjectToRoot(projectPath, targetRoot)
      return { ok: true, newPath }
    },

    // -----------------------------------------------------------------------
    // shell:openPath
    // Opens a file or folder with the default OS application.
    // Delegates to injected openPath (electron shell.openPath in register.ts).
    // -----------------------------------------------------------------------
    'shell:openPath': async (req) => {
      const obj = requireObject(req, 'req')
      const filePath = requireString(obj['path'], 'path')
      const errMsg = await openPath(filePath)
      // electron shell.openPath returns '' on success, or an error string
      return errMsg ? { ok: false, error: errMsg } : { ok: true }
    },

    // -----------------------------------------------------------------------
    // shell:openInVscode
    // Spawns `code <path>` to open a file or folder in VS Code.
    // Delegates to injected openInVscode (resolved via commandLocator in register.ts).
    // -----------------------------------------------------------------------
    'shell:openInVscode': async (req) => {
      const obj = requireObject(req, 'req')
      const filePath = requireString(obj['path'], 'path')
      return openInVscode(filePath)
    },

    // -----------------------------------------------------------------------
    // app:rendererReady
    // Renderer signals that its IPC event subscriptions are live.
    // -----------------------------------------------------------------------
    'app:rendererReady': async () => {
      onRendererReady?.()
    },
  }
}
