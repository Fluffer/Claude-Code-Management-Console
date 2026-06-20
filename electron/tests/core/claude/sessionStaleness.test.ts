import { describe, it, expect } from 'vitest'
import { isStale } from '../../../src/core/claude/sessionStaleness'

describe('SessionStaleness', () => {
  it('IsStale_OldAndIdleIsStale', () => {
    const now = '2026-06-09T12:00:00Z'
    const newest = '2026-05-30T12:00:00Z' // 10 days ago
    expect(isStale(newest, now, false, 7)).toBe(true)
  })

  it('IsStale_RecentIsNotStale', () => {
    const now = '2026-06-09T12:00:00Z'
    const newest = '2026-06-06T12:00:00Z' // 3 days ago
    expect(isStale(newest, now, false, 7)).toBe(false)
  })

  it('IsStale_RunningIsNeverStale', () => {
    const now = '2026-06-09T12:00:00Z'
    const newest = '2026-05-10T12:00:00Z' // 30 days ago
    expect(isStale(newest, now, true, 7)).toBe(false)
  })

  it('IsStale_NullNewestIsFalse', () => {
    expect(isStale(null, new Date().toISOString(), false, 7)).toBe(false)
  })
})
