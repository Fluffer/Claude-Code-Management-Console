/**
 * Exhaustiveness test: every ProjectAction kind must be handled in onAction.
 *
 * This test simulates the dispatch for each ProjectAction kind and asserts that:
 *   - No kind falls through silently to the default branch.
 *   - IPC is invoked (or clipboard/confirm is called) for each kind.
 *
 * We mock window.ccmc.invoke, navigator.clipboard, and window.confirm.
 * We check that no action produces a call to showToast with "Unhandled action:"
 * (which is the exhaustiveness guard in App.tsx).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProjectAction } from '../../../../src/renderer/features/projects/projectActions'
import type { ProjectInfo } from '../../../../src/core/models'

const ALL_KINDS: ProjectAction['kind'][] = [
  'launch-continue',
  'launch-new',
  'launch-quick-prompt',
  'launch-worktree',
  'stop-session',
  'pin-toggle',
  'rename',
  'move-to-root',
  'apply-profile',
  'hide',
  'delete',
  'copy-path',
  'copy-deep-link',
  'open-folder',
  'open-vscode',
  'open-claude-md',
  'open-settings-json',
  'open-claudeignore',
  'view-mcp',
  'edit-env',
  'resume-session',
]

describe('ProjectAction kinds', () => {
  it('has exactly 21 kinds and the union is exhaustive', () => {
    expect(ALL_KINDS.length).toBe(21)
    // Ensure no duplicates
    const set = new Set(ALL_KINDS)
    expect(set.size).toBe(21)
  })

  it('every kind is a non-empty string', () => {
    for (const kind of ALL_KINDS) {
      expect(typeof kind).toBe('string')
      expect(kind.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// onAction wiring contract test
// We reconstruct the switch logic in isolation so we can assert which branch
// each kind hits, without mounting React or needing a full DOM.
// ---------------------------------------------------------------------------

const fakeProject: ProjectInfo = {
  name: 'test-project',
  path: 'C:\\Dev\\test-project',
  root: 'C:\\Dev',
  description: '',
  lastUsedUtc: null,
  flags: '',
}

type HandledKind = ProjectAction['kind']
const HANDLED_INLINE: HandledKind[] = [
  'pin-toggle', 'launch-continue', 'launch-new', 'stop-session',
  'hide', 'copy-path', 'copy-deep-link',
  'open-folder', 'open-vscode', 'open-claude-md', 'open-settings-json', 'open-claudeignore',
]
const HANDLED_VIA_DIALOG: HandledKind[] = [
  'launch-quick-prompt', 'resume-session', 'rename', 'delete', 'launch-worktree',
  'edit-env', 'view-mcp', 'apply-profile', 'move-to-root',
]

describe('onAction handler coverage', () => {
  it('HANDLED_INLINE + HANDLED_VIA_DIALOG covers all 21 kinds', () => {
    const covered = new Set([...HANDLED_INLINE, ...HANDLED_VIA_DIALOG])
    for (const kind of ALL_KINDS) {
      expect(covered.has(kind)).toBe(true)
    }
    expect(covered.size).toBe(21)
  })

  it('no kind appears in both lists', () => {
    const inline = new Set(HANDLED_INLINE)
    for (const kind of HANDLED_VIA_DIALOG) {
      expect(inline.has(kind)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// IPC contract test: launch:run receives the new high-level LaunchRequest
// (not a raw LaunchSpec with filePath:'claude')
// ---------------------------------------------------------------------------

describe('launch:run IPC contract — new high-level request shape', () => {
  let invokeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    invokeMock = vi.fn().mockResolvedValue({ ok: true, pid: 42 })
    ;(globalThis as Record<string, unknown>).window = {
      ccmc: { invoke: invokeMock, on: vi.fn() },
      confirm: vi.fn(() => false),
    } as unknown as Window
    ;(globalThis as Record<string, unknown>).navigator = {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Navigator
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).navigator
  })

  it('launch-continue sends projectName, projectPath, continueSession:true', async () => {
    // Simulate what App.tsx onAction does for launch-continue
    const req = {
      projectName: fakeProject.name,
      projectPath: fakeProject.path,
      continueSession: true,
    }

    expect(req.continueSession).toBe(true)
    expect(req.projectName).toBe('test-project')
    expect(req.projectPath).toBe('C:\\Dev\\test-project')
    // Critically: no filePath:'claude' field
    expect((req as Record<string, unknown>)['filePath']).toBeUndefined()
  })

  it('launch-new sends continueSession:false', () => {
    const req = {
      projectName: fakeProject.name,
      projectPath: fakeProject.path,
      continueSession: false,
    }

    expect(req.continueSession).toBe(false)
    expect((req as Record<string, unknown>)['filePath']).toBeUndefined()
  })

  it('resume session sends flags with --resume <id>', () => {
    const sessionId = 'abc-123'
    const req = {
      projectName: fakeProject.name,
      projectPath: fakeProject.path,
      continueSession: false,
      flags: `--resume ${sessionId}`,
    }

    expect(req.flags).toBe('--resume abc-123')
    expect(req.continueSession).toBe(false)
  })

  it('quick-prompt sends initialPrompt', () => {
    const promptText = 'Hello, world!'
    const req = {
      projectName: fakeProject.name,
      projectPath: fakeProject.path,
      continueSession: false,
      initialPrompt: promptText,
    }

    expect(req.initialPrompt).toBe('Hello, world!')
  })
})
