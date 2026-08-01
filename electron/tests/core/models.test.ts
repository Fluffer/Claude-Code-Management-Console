/**
 * Compile + smoke tests for src/core/models.
 *
 * Interfaces are erased at runtime, so we prove the shapes compile by
 * constructing typed const fixtures. If any field is wrong (missing, wrong type,
 * extra non-existent field), tsc will fail here. The runtime expect() calls
 * verify that the module loads and the fixtures are structurally sound.
 */
import { describe, it, expect } from 'vitest'
import type {
  AppState,
  GitInfo,
  GitWorktree,
  LaunchGroup,
  LaunchProfile,
  LaunchSpec,
  LauncherConfig,
  McpServerInfo,
  ProjectInfo,
  RunningSession,
  SavedFilter,
  SessionSummary,
  ProjectUsage,
} from '../../src/core/models/index'

// ---------------------------------------------------------------------------
// Typed fixtures — these are the compile-time assertions.
// Any field mismatch or missing field causes a tsc error.
// ---------------------------------------------------------------------------

const gitInfo: GitInfo = {
  branch: 'main',
  isDirty: false,
}

const gitInfoUnknown: GitInfo = {
  branch: 'abc1234',
  isDirty: null,
}

const gitWorktree: GitWorktree = {
  path: '/repo',
  branch: 'feat/x',
  isDetached: false,
  isBare: false,
}

const mcpServer: McpServerInfo = {
  name: 'filesystem',
  transport: 'stdio',
}

const projectInfo: ProjectInfo = {
  name: 'my-project',
  root: '/dev',
  path: '/dev/my-project',
  lastUsedUtc: '2025-01-01T00:00:00Z',
  flags: '--dangerouslySkipPermissions',
  description: 'A test project',
}

const projectInfoNeverLaunched: ProjectInfo = {
  name: 'fresh',
  root: '/dev',
  path: '/dev/fresh',
  lastUsedUtc: null,
  flags: '',
  description: '',
}

const runningSession: RunningSession = {
  pid: 1234,
  processName: 'claude',
  workingDirectory: '/dev/my-project',
}

const sessionSummary: SessionSummary = {
  sessionId: 'abc123',
  lastWriteUtc: '2025-06-01T12:00:00Z',
  firstUserMessage: 'Help me refactor this file.',
}

const launchSpec: LaunchSpec = {
  filePath: '/usr/bin/claude',
  arguments: '--dangerouslySkipPermissions',
  workingDirectory: '/dev/my-project',
}

const launchSpecNoDir: LaunchSpec = {
  filePath: 'claude',
  arguments: '',
  workingDirectory: null,
}

const launchProfile: LaunchProfile = {
  name: 'Safe Read-Only',
  model: 'claude-opus-4-5',
  permissionMode: 'default',
  allowedTools: ['Read', 'Glob', 'Grep'],
  disallowedTools: ['Bash'],
}

const launchProfileMinimal: LaunchProfile = {
  name: 'Default',
  model: null,
  permissionMode: null,
  allowedTools: [],
  disallowedTools: [],
}

const launchGroup: LaunchGroup = {
  name: 'My Stack',
  projectPaths: ['/dev/frontend', '/dev/backend'],
}

const savedFilter: SavedFilter = {
  name: 'Active Git projects',
  pathContains: '/dev',
  requireGit: true,
  requireClaudeMd: false,
  requireRunning: false,
  requirePinned: false,
}

const savedFilterEmpty: SavedFilter = {
  name: 'All',
  pathContains: null,
  requireGit: false,
  requireClaudeMd: false,
  requireRunning: false,
  requirePinned: false,
}

const projectUsage: ProjectUsage = {
  lastUsed: '2025-06-01T00:00:00Z',
  flags: '--model claude-opus-4-5',
}

const launcherConfig: LauncherConfig = {
  roots: ['/dev'],
  defaultRoot: '/dev',
  ignore: ['node_modules'],
  hidden: [],
  projects: {
    '/dev/my-project': projectUsage,
  },
}

const launcherConfigEmpty: LauncherConfig = {
  roots: null,
  defaultRoot: null,
  ignore: null,
  hidden: null,
  projects: null,
}

const appState: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: ['/dev/my-project'],
  onboardingDismissed: false,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: ['/dev/my-project'],
  profiles: [launchProfile],
  groups: [launchGroup],
  savedFilters: [savedFilter],
  closeToTray: false,
  terminalId: '',
  defaultPermissionMode: 'auto',
}

// ---------------------------------------------------------------------------
// Runtime assertions — verify the module loaded and shapes are structurally sound
// ---------------------------------------------------------------------------

describe('core/models', () => {
  it('GitInfo shape is correct', () => {
    expect(gitInfo.branch).toBe('main')
    expect(gitInfo.isDirty).toBe(false)
    expect(gitInfoUnknown.isDirty).toBeNull()
  })

  it('GitWorktree shape is correct', () => {
    expect(gitWorktree.path).toBe('/repo')
    expect(gitWorktree.branch).toBe('feat/x')
    expect(gitWorktree.isDetached).toBe(false)
    expect(gitWorktree.isBare).toBe(false)
  })

  it('McpServerInfo shape is correct', () => {
    expect(mcpServer.name).toBe('filesystem')
    expect(mcpServer.transport).toBe('stdio')
  })

  it('ProjectInfo shape is correct', () => {
    expect(projectInfo.name).toBe('my-project')
    expect(projectInfo.lastUsedUtc).toBe('2025-01-01T00:00:00Z')
    expect(projectInfoNeverLaunched.lastUsedUtc).toBeNull()
    expect(projectInfo.description).toBe('A test project')
  })

  it('RunningSession shape is correct', () => {
    expect(runningSession.pid).toBe(1234)
    expect(runningSession.processName).toBe('claude')
    expect(runningSession.workingDirectory).toBe('/dev/my-project')
  })

  it('SessionSummary shape is correct', () => {
    expect(sessionSummary.sessionId).toBe('abc123')
    expect(sessionSummary.lastWriteUtc).toBe('2025-06-01T12:00:00Z')
    expect(sessionSummary.firstUserMessage).toContain('refactor')
  })

  it('LaunchSpec shape is correct', () => {
    expect(launchSpec.filePath).toBe('/usr/bin/claude')
    expect(launchSpec.workingDirectory).toBe('/dev/my-project')
    expect(launchSpecNoDir.workingDirectory).toBeNull()
  })

  it('LaunchProfile shape is correct', () => {
    expect(launchProfile.name).toBe('Safe Read-Only')
    expect(launchProfile.model).toBe('claude-opus-4-5')
    expect(launchProfile.allowedTools).toContain('Read')
    expect(launchProfileMinimal.model).toBeNull()
    expect(launchProfileMinimal.allowedTools).toHaveLength(0)
  })

  it('LaunchGroup shape is correct', () => {
    expect(launchGroup.name).toBe('My Stack')
    expect(launchGroup.projectPaths).toHaveLength(2)
  })

  it('SavedFilter shape is correct', () => {
    expect(savedFilter.name).toBe('Active Git projects')
    expect(savedFilter.pathContains).toBe('/dev')
    expect(savedFilter.requireGit).toBe(true)
    expect(savedFilterEmpty.pathContains).toBeNull()
  })

  it('LauncherConfig and ProjectUsage shapes are correct', () => {
    expect(launcherConfig.roots).toContain('/dev')
    expect(launcherConfig.projects!['/dev/my-project'].lastUsed).toBe('2025-06-01T00:00:00Z')
    expect(launcherConfigEmpty.roots).toBeNull()
    expect(launcherConfigEmpty.projects).toBeNull()
  })

  it('AppState shape is correct', () => {
    expect(appState.theme).toBe('System')
    expect(appState.sortMode).toBe('LastUsed')
    expect(appState.pinned).toContain('/dev/my-project')
    expect(appState.profiles).toHaveLength(1)
    expect(appState.groups).toHaveLength(1)
    expect(appState.savedFilters).toHaveLength(1)
    expect(appState.closeToTray).toBe(false)
  })
})
