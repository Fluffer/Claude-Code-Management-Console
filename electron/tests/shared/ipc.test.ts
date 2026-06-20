/**
 * Runtime + compile-time tests for the typed IPC contract.
 *
 * Runtime assertions verify:
 *   - IPC object is frozen
 *   - all channel-name string values are unique (no duplicates)
 *
 * Compile-time assertions (via @ts-expect-error) verify:
 *   - a wrong req type is rejected by the TypedInvoke signature
 */
import { describe, it, expect } from 'vitest'
import { IPC } from '../../src/shared/ipc'
import type { TypedInvoke, IpcMap } from '../../src/shared/ipc'

// ---------------------------------------------------------------------------
// Runtime assertions
// ---------------------------------------------------------------------------

describe('IPC constant', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(IPC)).toBe(true)
  })

  it('has no duplicate channel-name values', () => {
    const values = Object.values(IPC)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('contains all expected channels', () => {
    expect(IPC.CONFIG_READ).toBe('config:read')
    expect(IPC.CONFIG_WRITE).toBe('config:write')
    expect(IPC.STATE_READ).toBe('state:read')
    expect(IPC.STATE_WRITE).toBe('state:write')
    expect(IPC.PROJECTS_SCAN).toBe('projects:scan')
    expect(IPC.PROJECTS_CREATE).toBe('projects:create')
    expect(IPC.PROJECTS_RENAME).toBe('projects:rename')
    expect(IPC.PROJECTS_DELETE).toBe('projects:delete')
    expect(IPC.PROJECTS_CLAUDE_INFO).toBe('projects:claudeInfo')
    expect(IPC.SESSIONS_LIST_HISTORY).toBe('sessions:listHistory')
    expect(IPC.SESSIONS_LIST_RUNNING).toBe('sessions:listRunning')
    expect(IPC.SESSIONS_KILL).toBe('sessions:kill')
    expect(IPC.GIT_INFO).toBe('git:info')
    expect(IPC.GIT_WORKTREES).toBe('git:worktrees')
    expect(IPC.LAUNCH_RUN).toBe('launch:run')
    expect(IPC.ENV_READ).toBe('env:read')
    expect(IPC.ENV_WRITE).toBe('env:write')
    expect(IPC.MCP_READ).toBe('mcp:read')
    expect(IPC.TERMINALS_DETECT).toBe('terminals:detect')
    expect(IPC.DIALOG_PICK_FOLDER).toBe('dialog:pickFolder')
  })

  it('all channel names follow the domain:verb pattern', () => {
    const domainVerb = /^[a-z]+:[a-zA-Z]+$/
    for (const value of Object.values(IPC)) {
      expect(value).toMatch(domainVerb)
    }
  })
})

// ---------------------------------------------------------------------------
// Compile-time type guard
//
// TypedInvoke<'projects:scan'> expects { root: string } as the req argument.
// Passing a number should be a type error — verified with @ts-expect-error.
// If the error disappears, tsc will fail the @ts-expect-error directive,
// proving the type is still enforced.
// ---------------------------------------------------------------------------

describe('TypedInvoke type-level guards', () => {
  it('rejects a wrong req type at compile time', () => {
    // Simulate a typed invoke surface for type-checking purposes only.
    // The actual implementation is provided by the preload bridge in a later task.
    const fakeInvoke = ((_channel: unknown, ..._args: unknown[]) =>
      Promise.resolve(undefined)) as unknown as TypedInvoke

    // This call is valid — { root: string } satisfies IpcMap['projects:scan']['req']
    const _valid = fakeInvoke('projects:scan', { root: '/dev' })
    void _valid

    // @ts-expect-error — passing a number instead of { root: string } must be rejected
    const _invalid = fakeInvoke('projects:scan', 42)
    void _invalid
  })

  it('accepts a void-req channel with no argument', () => {
    const fakeInvoke = ((_channel: unknown, ..._args: unknown[]) =>
      Promise.resolve(undefined)) as unknown as TypedInvoke

    // config:read has req: void — no second argument should be required
    const _result: Promise<IpcMap['config:read']['res']> = fakeInvoke('config:read')
    void _result
  })
})
