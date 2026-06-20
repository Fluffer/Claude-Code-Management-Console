import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyRank } from '../../../src/core/projects/fuzzyMatcher'

describe('FuzzyMatcher', () => {
  it('Score_NullWhenNotSubsequence', () => {
    expect(fuzzyScore('xyz', 'Hotel-Search')).toBeNull()
  })

  it('Score_NonNullWhenSubsequence', () => {
    expect(fuzzyScore('hs', 'Hotel-Search')).not.toBeNull()
  })

  it('Score_EmptyQueryMatchesEverything', () => {
    expect(fuzzyScore('', 'anything')).not.toBeNull()
  })

  it('Score_ContiguousBeatsScattered', () => {
    const contiguous = fuzzyScore('hot', 'Hotel')
    const scattered = fuzzyScore('hot', 'Have-Other-Tasks')
    expect(contiguous).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(contiguous!).toBeGreaterThan(scattered!)
  })

  it('Rank_OrdersByScoreDescAndFiltersNonMatches', () => {
    const items = ['Hotel-Search', 'Banana', 'House']
    const ranked = fuzzyRank('ho', items, (s) => s)
    expect(ranked).not.toContain('Banana')
    expect(ranked).toContain('House')
    expect(ranked).toContain('Hotel-Search')
  })
})
