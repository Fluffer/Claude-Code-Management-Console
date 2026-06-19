import { describe, it, expect } from 'vitest'
import { parse, isOutdated } from '../../../src/core/claude/claudeVersionInfo'

describe('ClaudeVersionInfo', () => {
  it('Parse_ExtractsSemver_WithSuffix', () => {
    const v = parse('2.1.0 (Claude Code)')
    expect(v).not.toBeNull()
    expect(v!.major).toBe(2)
    expect(v!.minor).toBe(1)
    expect(v!.patch).toBe(0)
  })

  it('Parse_ExtractsSemver_WithV', () => {
    const v = parse('v2.10.3')
    expect(v).not.toBeNull()
    expect(v!.major).toBe(2)
    expect(v!.minor).toBe(10)
    expect(v!.patch).toBe(3)
  })

  it('Parse_ExtractsSemver_Plain', () => {
    const v = parse('1.0.45')
    expect(v).not.toBeNull()
    expect(v!.major).toBe(1)
    expect(v!.minor).toBe(0)
    expect(v!.patch).toBe(45)
  })

  it('Parse_ReturnsNullOnGarbage', () => {
    expect(parse('not a version')).toBeNull()
  })

  it('Parse_ReturnsNullOnEmpty', () => {
    expect(parse('')).toBeNull()
  })

  it('IsOutdated_PatchBehind', () => {
    expect(isOutdated('2.1.0', '2.1.1')).toBe(true)
  })

  it('IsOutdated_MinorBehind', () => {
    expect(isOutdated('2.1.0', '2.2.0')).toBe(true)
  })

  it('IsOutdated_MajorBehind', () => {
    expect(isOutdated('2.1.0', '3.0.0')).toBe(true)
  })

  it('IsOutdated_SameVersion', () => {
    expect(isOutdated('2.1.0', '2.1.0')).toBe(false)
  })

  it('IsOutdated_InstalledAhead', () => {
    expect(isOutdated('2.1.5', '2.1.0')).toBe(false)
  })

  it('IsOutdated_GarbageInstalled', () => {
    expect(isOutdated('garbage', '2.1.0')).toBe(false)
  })

  it('IsOutdated_GarbageLatest', () => {
    expect(isOutdated('2.1.0', 'garbage')).toBe(false)
  })

  it('IsOutdated_NullInstalled', () => {
    expect(isOutdated(null, '2.1.0')).toBe(false)
  })
})
