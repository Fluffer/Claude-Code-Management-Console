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
import { getBranchInfo, getIsDirty, getWorktrees } from '../services/gitRunner'
import { readEnv, writeEnv } from '../services/envFileStore'
import { readMcp } from '../services/mcpStore'
import { createProjectFolder } from '../services/projectFolderCreator'
import { renameProject } from '../services/projectMover'
import { deleteProject } from '../services/projectDeleter'
import { claudeMdPath, hasClaudeMdInProject } from '../services/projectClaudeStore'

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
  } = deps

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
      const [hasClaude, mdPath, mcpServers] = await Promise.all([
        hasClaudeMdInProject(projectPath),
        claudeMdPath(projectPath),
        readMcp(projectPath),
      ])
      const filename = mdPath !== null ? mdPath.split(/[\\/]/).pop() ?? null : null
      return {
        hasClaudeMd: hasClaude,
        claudeMdFilename: filename,
        hasMcp: mcpServers.length > 0,
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
    // launch:run
    // -----------------------------------------------------------------------
    'launch:run': async (req) => {
      const obj = requireObject(req, 'req')
      requireString(obj['filePath'], 'filePath')
      requireString(obj['arguments'], 'arguments')
      // workingDirectory may be null — valid
      if (obj['workingDirectory'] !== null && obj['workingDirectory'] !== undefined) {
        requireString(obj['workingDirectory'], 'workingDirectory')
      }

      const result = await terminalLauncher.launch(req)
      return { ok: result.ok, pid: result.pid }
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
      const terminals: { id: string; name: string }[] = []

      const [wtPath, shell] = await Promise.all([
        commandLocator.findWindowsTerminal(),
        commandLocator.getPreferredShell(),
      ])

      if (wtPath !== null) {
        terminals.push({ id: 'wt', name: 'Windows Terminal' })
      }

      const shellName = shell === 'pwsh' ? 'PowerShell 7' : 'Windows PowerShell'
      terminals.push({ id: shell, name: shellName })

      return terminals
    },

    // -----------------------------------------------------------------------
    // dialog:pickFolder
    // Delegates to injected pickFolder (implemented with electron dialog in register.ts).
    // -----------------------------------------------------------------------
    'dialog:pickFolder': async (req) => {
      return pickFolder(req ?? {})
    },
  }
}
