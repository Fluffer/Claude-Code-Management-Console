import { describe, it, expect } from 'vitest'
import { composeProfile } from '../../../src/core/launch/profileComposer'
import { areFlagsSafe } from '../../../src/core/launch/launchCommandBuilder'
import type { LaunchProfile } from '../../../src/core/models'

describe('ProfileComposer', () => {
  it('Compose_ModelOnly', () => {
    const p: LaunchProfile = { name: 'Opus', model: 'opus', permissionMode: null, allowedTools: [], disallowedTools: [] }
    expect(composeProfile(p)).toBe('--model opus')
  })

  it('Compose_AllParts_InStableOrder', () => {
    const p: LaunchProfile = {
      name: 'Plan-safe',
      model: 'sonnet',
      permissionMode: 'plan',
      allowedTools: ['Read', 'Edit'],
      disallowedTools: ['Bash'],
    }
    expect(composeProfile(p)).toBe(
      '--model sonnet --permission-mode plan --allowedTools Read Edit --disallowedTools Bash'
    )
  })

  it('Compose_EmptyProfile_IsEmptyString', () => {
    const p: LaunchProfile = { name: 'Empty', model: null, permissionMode: null, allowedTools: [], disallowedTools: [] }
    expect(composeProfile(p)).toBe('')
  })

  it('Compose_ThrowsOnUnsafeToken_Pipe', () => {
    const p: LaunchProfile = { name: 'x', model: null, permissionMode: null, allowedTools: ['opus | rm'], disallowedTools: [] }
    expect(() => composeProfile(p)).toThrow()
  })

  it('Compose_ThrowsOnUnsafeToken_Parens', () => {
    const p: LaunchProfile = { name: 'x', model: null, permissionMode: null, allowedTools: ['Bash(git:*)'], disallowedTools: [] }
    expect(() => composeProfile(p)).toThrow()
  })

  it('Compose_ResultAlwaysPassesAreFlagsSafe', () => {
    const p: LaunchProfile = {
      name: 'ok',
      model: 'haiku',
      permissionMode: 'acceptEdits',
      allowedTools: ['Read'],
      disallowedTools: [],
    }
    expect(areFlagsSafe(composeProfile(p))).toBe(true)
  })
})
