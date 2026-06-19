import { describe, it, expect } from 'vitest'
import { ended } from '../../../src/core/claude/sessionEndDetector'

describe('SessionEndDetector', () => {
  it('Ended_ReturnsPathsThatLeftTheSet', () => {
    const prev = new Set(['C:\\a', 'C:\\b'])
    const now = new Set(['C:\\a'])
    expect(ended(prev, now)).toEqual(['C:\\b'])
  })

  it('Ended_EmptyWhenNothingLeft', () => {
    const prev = new Set(['C:\\a'])
    const now = new Set(['C:\\a', 'C:\\b'])
    expect(ended(prev, now)).toHaveLength(0)
  })

  it('Ended_IsCaseInsensitive', () => {
    const prev = new Set(['C:\\A'])
    const now = new Set<string>()
    expect(ended(prev, now)).toEqual(['C:\\A'])
  })
})
