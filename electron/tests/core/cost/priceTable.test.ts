import { describe, it, expect } from 'vitest'
import { priceFor, CACHE_WRITE_MULTIPLIER, CACHE_READ_MULTIPLIER } from '../../../src/core/cost/priceTable'

describe('priceFor', () => {
  it('prices opus / sonnet / haiku families by substring', () => {
    expect(priceFor('claude-opus-4-7')).toEqual({ inputPerMtok: 15, outputPerMtok: 75 })
    expect(priceFor('claude-sonnet-4-6')).toEqual({ inputPerMtok: 3, outputPerMtok: 15 })
    expect(priceFor('claude-haiku-4-5')).toEqual({ inputPerMtok: 1, outputPerMtok: 5 })
  })

  it('prices a future point release via family match', () => {
    expect(priceFor('claude-opus-4-9')).toEqual({ inputPerMtok: 15, outputPerMtok: 75 })
  })

  it('returns null for unknown / null models', () => {
    expect(priceFor('claude-fable-5')).toBeNull()
    expect(priceFor(null)).toBeNull()
  })

  it('exposes the cache multipliers', () => {
    expect(CACHE_WRITE_MULTIPLIER).toBe(1.25)
    expect(CACHE_READ_MULTIPLIER).toBe(0.1)
  })
})
