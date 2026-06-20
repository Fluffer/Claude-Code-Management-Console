import { describe, it, expect } from 'vitest'
import { computeCost } from '../../../src/core/cost/costCalculator'
import type { TranscriptMessage } from '../../../src/core/models'

function asst(model: string | null, usage: TranscriptMessage['usage']): TranscriptMessage {
  return { role: 'assistant', text: '', timestamp: null, model, usage }
}

describe('computeCost', () => {
  it('sums input + output + cache costs for a priced model', () => {
    // opus: in 15, out 75 per Mtok; cache write = 1.25x input = 18.75; cache read = 0.1x input = 1.5
    const msgs = [asst('claude-opus-4-7', { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationTokens: 1_000_000, cacheReadTokens: 1_000_000 })]
    const result = computeCost(msgs)
    // 15 + 75 + 18.75 + 1.5 = 110.25
    expect(result.usd).toBeCloseTo(110.25, 6)
    expect(result.hasUnknownModel).toBe(false)
  })

  it('ignores messages without usage', () => {
    const msgs = [asst('claude-opus-4-7', null), { role: 'user', text: 'hi', timestamp: null, model: null, usage: null } as TranscriptMessage]
    expect(computeCost(msgs).usd).toBe(0)
  })

  it('flags unknown models but still sums priced ones', () => {
    const msgs = [
      asst('claude-fable-5', { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }),
      asst('claude-sonnet-4-6', { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }),
    ]
    const result = computeCost(msgs)
    expect(result.usd).toBeCloseTo(3, 6) // sonnet input only
    expect(result.hasUnknownModel).toBe(true)
  })

  it('returns zero for empty input', () => {
    expect(computeCost([])).toEqual({ usd: 0, hasUnknownModel: false })
  })
})
