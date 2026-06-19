/**
 * Typed IPC contract — importable by main, preload, and renderer.
 * No electron or Node.js imports; pure TypeScript types + a frozen constant.
 */
import type {
  AppState,
  GitInfo,
  GitWorktree,
  LauncherConfig,
  LaunchSpec,
  McpServerInfo,
  ProjectInfo,
  RunningSession,
  SessionSummary,
} from '../core/models'

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
  SESSIONS_LIST_HISTORY: 'sessions:listHistory',
  SESSIONS_LIST_RUNNING: 'sessions:listRunning',
  SESSIONS_KILL: 'sessions:kill',
  GIT_INFO: 'git:info',
  GIT_WORKTREES: 'git:worktrees',
  LAUNCH_RUN: 'launch:run',
  ENV_READ: 'env:read',
  ENV_WRITE: 'env:write',
  MCP_READ: 'mcp:read',
  TERMINALS_DETECT: 'terminals:detect',
  DIALOG_PICK_FOLDER: 'dialog:pickFolder',
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
    res: { hasClaudeMd: boolean; claudeMdFilename: string | null; hasMcp: boolean }
  }
  'sessions:listHistory': { req: { projectPath?: string }; res: SessionSummary[] }
  'sessions:listRunning': { req: void; res: RunningSession[] }
  'sessions:kill': { req: { pid: number }; res: { ok: boolean } }
  'git:info': { req: { path: string }; res: GitInfo }
  'git:worktrees': { req: { path: string }; res: GitWorktree[] }
  'launch:run': { req: LaunchSpec; res: { ok: boolean; pid?: number } }
  'env:read': { req: { path: string }; res: string }
  'env:write': { req: { path: string; contents: string }; res: void }
  'mcp:read': { req: { path: string }; res: McpServerInfo[] }
  'terminals:detect': { req: void; res: { id: string; name: string }[] }
  'dialog:pickFolder': { req: { title?: string }; res: { path: string | null } }
}

// ---------------------------------------------------------------------------
// IpcEvents — main → renderer push events
// ---------------------------------------------------------------------------

export interface IpcEvents {
  'event:deepLink': { url: string }
  'event:fileChanged': { path: string }
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
