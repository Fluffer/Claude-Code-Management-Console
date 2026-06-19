import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '../../../src/core/util/relativeTimeFormatter'

const NOW = new Date('2026-06-06T12:00:00Z')

describe('RelativeTimeFormatter', () => {
  it('Null_ReturnsEmpty', () => {
    expect(formatRelativeTime(null, NOW)).toBe('')
  })

  it('Minutes_JustNow', () => {
    const ts = new Date(NOW.getTime() - 0.5 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('just now')
  })

  it('Minutes_5m', () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('5m ago')
  })

  it('Minutes_59m', () => {
    const ts = new Date(NOW.getTime() - 59 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('59m ago')
  })

  it('Hours_1h', () => {
    const ts = new Date(NOW.getTime() - 1 * 60 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('1h ago')
  })

  it('Hours_23h', () => {
    const ts = new Date(NOW.getTime() - 23 * 60 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('23h ago')
  })

  it('Days_1d', () => {
    const ts = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('1d ago')
  })

  it('Days_6d', () => {
    const ts = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(ts, NOW)).toBe('6d ago')
  })

  it('OlderThanAWeek_ShowsDate', () => {
    const ts = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    const formatted = formatRelativeTime(ts, NOW)
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
