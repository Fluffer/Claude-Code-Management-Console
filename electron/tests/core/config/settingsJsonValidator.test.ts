import { describe, it, expect } from 'vitest'
import { validateSettingsJson } from '../../../src/core/config/settingsJsonValidator'

describe('SettingsJsonValidator', () => {
  it('Validate_AbsentFile_IsValidWithNoError', () => {
    const r = validateSettingsJson(null)
    expect(r.isValid).toBe(true)
    expect(r.error).toBeNull()
  })

  it('Validate_WellFormedJson_IsValid', () => {
    const r = validateSettingsJson('{ "model": "opus" }')
    expect(r.isValid).toBe(true)
    expect(r.error).toBeNull()
  })

  it('Validate_BrokenJson_IsInvalidWithMessage', () => {
    const r = validateSettingsJson('{ "model": "opus" ')
    expect(r.isValid).toBe(false)
    expect(r.error).toBeTruthy()
    expect(typeof r.error).toBe('string')
    expect((r.error as string).length).toBeGreaterThan(0)
  })

  it('Validate_EmptyString_IsInvalid', () => {
    const r = validateSettingsJson('')
    expect(r.isValid).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('Validate_ArrayJson_IsValid', () => {
    const r = validateSettingsJson('[1, 2, 3]')
    expect(r.isValid).toBe(true)
    expect(r.error).toBeNull()
  })
})
