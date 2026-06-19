import { describe, it, expect } from 'vitest'
import { setModel, currentModel } from '../../../src/core/config/flagsEditor'

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
