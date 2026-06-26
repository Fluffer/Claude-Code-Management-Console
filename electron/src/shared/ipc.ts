/**
 * Typed IPC contract — importable by main, preload, and renderer.
 * No electron or Node.js imports; pure TypeScript types + a frozen constant.
 */
import type {
  AppState,
  CommandInfo,
  GitInfo,
  GitWorktree,
  HealthResult,
  LauncherConfig,
  McpServerInfo,
  ProjectInfo,
  RunningSession,
  SessionSummary,
  SkillInfo,
  TranscriptMessage,
} from '../core/models'

// ---------------------------------------------------------------------------
// High-level launch request (replaces raw LaunchSpec in the IPC contract).
// Shell/WT resolution happens in main; renderer supplies intent only.
// ---------------------------------------------------------------------------
export interface LaunchRequest {
  projectName: string
  projectPath: string
  continueSession: boolean
  /** Extra claude flags (e.g. '--resume <id>'). Must not contain shell operators. */
  flags?: string
  /**
   * Initial prompt text. Appended as the trailing positional argument when
   * continueSession=false; any `flags` follow it on the same command line.
   * Ignored when continueSession=true.
   */
  initialPrompt?: string | null
  /**
   * Record this launch in usage (config lastUsed) + recentLaunches MRU.
   * Defaults to true. Worktree launches target a sibling path, not the tracked
   * project, so they pass false (mirrors MainViewModel which skips them).
   */
  recordUsage?: boolean
}

// ---------------------------------------------------------------------------
// Channel-name constants
// ---------------------------------------------------------------------------

export const IPC = Object.freeze({
  CONFIG_READ: 'config:read',
  CONFIG_WRITE: 'config:write',
  STATE_READ: 'state:read',
  STATE_WRITE: 'state:write',
  PROJECTS_SCAN: 'projects:scan',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_RENAME: 'projects:rename',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_CLAUDE_INFO: 'projects:claudeInfo',
  PROJECTS_MOVE: 'projects:move',
  SESSIONS_LIST_HISTORY: 'sessions:listHistory',
  SESSIONS_LIST_RUNNING: 'sessions:listRunning',
  SESSIONS_KILL: 'sessions:kill',
  SESSIONS_READ_TRANSCRIPT: 'sessions:readTranscript',
  SESSIONS_COST: 'sessions:cost',
  GIT_INFO: 'git:info',
  GIT_WORKTREES: 'git:worktrees',
  GIT_ADD_WORKTREE: 'git:addWorktree',
  GIT_CLONE: 'git:clone',
  PROJECT_DUPLICATE: 'project:duplicate',
  GIT_COMMIT: 'git:commit',
  GIT_OPEN_PR: 'git:openPr',
  LAUNCH_RUN: 'launch:run',
  ENV_READ: 'env:read',
  ENV_WRITE: 'env:write',
  MCP_READ: 'mcp:read',
  MCP_HEALTH: 'mcp:health',
  COMMANDS_LIST: 'commands:list',
  SKILLS_LIST: 'skills:list',
  TERMINALS_DETECT: 'terminals:detect',
  DIALOG_PICK_FOLDER: 'dialog:pickFolder',
  SHELL_OPEN_PATH: 'shell:openPath',
  SHELL_OPEN_IN_VSCODE: 'shell:openInVscode',
  APP_RENDERER_READY: 'app:rendererReady',
  CLAUDE_ON_PATH: 'claude:onPath',
  CLAUDE_VERSION: 'claude:version',
  FS_IS_DIRECTORY: 'fs:isDirectory',
  CONFIG_ADD_ROOTS: 'config:addRoots',
} as const)

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// ---------------------------------------------------------------------------
// IpcMap — maps every channel to its { req, res } pair
// ---------------------------------------------------------------------------

export interface IpcMap {
  'config:read': { req: void; res: LauncherConfig }
  'config:write': { req: LauncherConfig; res: void }
  'state:read': { req: void; res: AppState }
  'state:write': { req: AppState; res: void }
  'projects:scan': { req: { root: string }; res: ProjectInfo[] }
  'projects:create': { req: { root: string; name: string }; res: { path: string } }
  'projects:rename': { req: { path: string; newName: string }; res: { path: string } }
  'projects:delete': { req: { path: string; permanent: boolean }; res: { ok: boolean } }
  'projects:claudeInfo': {
    req: { path: string }
    res: {
      hasClaudeMd: boolean
      claudeMdFilename: string | null
      hasMcp: boolean
      hasCommands: boolean
      hasSkills: boolean
      /** Effective default model from project/user settings.json, or null. */
      defaultModel: string | null
    }
  }
  'projects:move': { req: { path: string; targetRoot: string }; res: { ok: boolean; newPath: string } }
  'sessions:listHistory': { req: { projectPath?: string }; res: SessionSummary[] }
  'sessions:listRunning': { req: void; res: RunningSession[] }
  'sessions:kill': { req: { pid: number }; res: { ok: boolean } }
  'sessions:readTranscript': {
    req: { projectPath: string; sessionId: string }
    res: TranscriptMessage[]
  }
  'sessions:cost': {
    req: { projectPath: string }
    res: { usd: number; hasUnknownModel: boolean; sessionCount: number }
  }
  'git:info': { req: { path: string }; res: GitInfo }
  'git:worktrees': { req: { path: string }; res: GitWorktree[] }
  'git:addWorktree': {
    req: { repoPath: string; branch: string }
    res: { ok: boolean; path?: string; error?: string }
  }
  'git:clone': {
    req: { url: string; targetRoot: string; name: string }
    res: { ok: boolean; path?: string; error?: string }
  }
  'project:duplicate': {
    req: { sourcePath: string; targetRoot: string; name: string; mode: 'git' | 'copy' }
    res: { ok: boolean; path?: string; error?: string }
  }
  'git:commit': {
    req: { path: string; message: string; push: boolean }
    res: { ok: boolean; error?: string }
  }
  'git:openPr': {
    req: { path: string; commitMessage?: string; title: string; body?: string }
    res: { ok: boolean; url?: string; error?: string }
  }
  'launch:run': { req: LaunchRequest; res: { ok: boolean; pid?: number; error?: string } }
  'env:read': { req: { path: string }; res: string }
  'env:write': { req: { path: string; contents: string }; res: void }
  'mcp:read': { req: { path: string }; res: McpServerInfo[] }
  'mcp:health': { req: { path: string }; res: HealthResult[] }
  'commands:list': { req: { path: string }; res: CommandInfo[] }
  'skills:list': { req: { path: string }; res: SkillInfo[] }
  'terminals:detect': { req: void; res: { id: string; name: string; path: string }[] }
  'dialog:pickFolder': { req: { title?: string }; res: { path: string | null } }
  'shell:openPath': { req: { path: string }; res: { ok: boolean; error?: string } }
  'shell:openInVscode': { req: { path: string }; res: { ok: boolean; error?: string } }
  'app:rendererReady': { req: void; res: void }
  'claude:onPath': { req: void; res: { onPath: boolean } }
  'claude:version': { req: void; res: { version: string | null } }
  'fs:isDirectory': { req: { path: string }; res: { ok: boolean } }
  'config:addRoots': { req: { paths: string[] }; res: { added: number } }
}

// ---------------------------------------------------------------------------
// IpcEvents — main → renderer push events
// ---------------------------------------------------------------------------

export interface IpcEvents {
  'event:deepLink': { url: string }
  'event:fileChanged': { path: string }
  'event:openPalette': void
}

export type IpcEventChannel = keyof IpcEvents

// ---------------------------------------------------------------------------
// Helper types for the typed invoke/handle surface
// ---------------------------------------------------------------------------

/** Typed invoke: call from renderer, returns a promise of the channel's res type. */
export type TypedInvoke = <C extends keyof IpcMap>(
  channel: C,
  ...args: IpcMap[C]['req'] extends void ? [] : [req: IpcMap[C]['req']]
) => Promise<IpcMap[C]['res']>

/** Typed handler: registered in main to satisfy a channel's contract. */
export type IpcHandler<C extends keyof IpcMap> = (
  req: IpcMap[C]['req'],
) => Promise<IpcMap[C]['res']> | IpcMap[C]['res']

/** Typed subscribe: renderer subscribes to a main→renderer push event. */
export type TypedSubscribe = <E extends keyof IpcEvents>(
  event: E,
  listener: (payload: IpcEvents[E]) => void,
) => () => void
