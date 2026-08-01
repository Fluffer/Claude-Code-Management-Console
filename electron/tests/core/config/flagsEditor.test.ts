import { describe, it, expect } from 'vitest'
import {
  setModel,
  currentModel,
  currentPermissionMode,
  withDefaultPermissionMode,
} from '../../../src/core/config/flagsEditor'

describe('FlagsEditor', () => {
  it.each([
    ['', 'opus', '--model opus'],
    ['--verbose', 'opus', '--verbose --model opus'],
    ['--model sonnet', 'opus', '--model opus'],
    ['--model sonnet --verbose', 'opus', '--verbose --model opus'],
    ['--model sonnet', null, ''],
    ['--verbose --model opus', null, '--verbose'],
  ])('SetModel(%s, %s) === %s', (flags, model, expected) => {
    expect(setModel(flags, model)).toBe(expected)
  })

  it('CurrentModel_ReadsBackWhatWasSet', () => {
    expect(currentModel('--verbose --model opus')).toBe('opus')
  })

  it('CurrentModel_NullWhenAbsent', () => {
    expect(currentModel('--verbose')).toBeNull()
  })

  it('CurrentModel_NullOrEmpty_ReturnsNull', () => {
    expect(currentModel(null)).toBeNull()
    expect(currentModel('')).toBeNull()
  })
})

describe('withDefaultPermissionMode', () => {
  it('appends the default when the flags have none', () => {
    expect(withDefaultPermissionMode('', 'auto')).toBe('--permission-mode auto')
    expect(withDefaultPermissionMode(null, 'auto')).toBe('--permission-mode auto')
    expect(withDefaultPermissionMode('--model opus', 'auto')).toBe('--model opus --permission-mode auto')
  })

  it('never overrides a mode the project already set', () => {
    // The whole safety property: a project pinned to plan must not silently
    // become auto because the app-wide default changed.
    expect(withDefaultPermissionMode('--permission-mode plan', 'auto')).toBe('--permission-mode plan')
    expect(withDefaultPermissionMode('--model opus --permission-mode plan', 'auto')).toBe(
      '--model opus --permission-mode plan',
    )
  })

  it('recognises the --flag=value form too', () => {
    expect(withDefaultPermissionMode('--permission-mode=plan', 'auto')).toBe('--permission-mode=plan')
  })

  it('treats a blank default as "leave it to the CLI"', () => {
    expect(withDefaultPermissionMode('--model opus', '')).toBe('--model opus')
    expect(withDefaultPermissionMode('--model opus', null)).toBe('--model opus')
    expect(withDefaultPermissionMode('', '')).toBe('')
  })

  it('does not mistake another flag ending in the same word', () => {
    expect(withDefaultPermissionMode('--no-permission-mode-thing x', 'auto')).toContain('--permission-mode auto')
  })

  it('CurrentPermissionMode reads either form', () => {
    expect(currentPermissionMode('--permission-mode plan')).toBe('plan')
    expect(currentPermissionMode('--permission-mode=plan')).toBe('plan')
    expect(currentPermissionMode('--model opus')).toBeNull()
    expect(currentPermissionMode(null)).toBeNull()
  })
})
