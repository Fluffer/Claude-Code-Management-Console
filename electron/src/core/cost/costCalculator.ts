import type { TranscriptMessage } from '../models'
import { priceFor, CACHE_WRITE_MULTIPLIER, CACHE_READ_MULTIPLIER } from './priceTable'

export interface CostResult {
  /** Total USD across all priced messages with usage. */
  usd: number
  /** True when at least one message had usage but an unpriced (unknown) model. */
  hasUnknownModel: boolean
}

/** Computes the USD cost of transcript messages from their token usage. */
export function computeCost(messages: TranscriptMessage[]): CostResult {
  let usd = 0
  let hasUnknownModel = false
  for (const m of messages) {
    if (!m.usage) continue
    const price = priceFor(m.model)
    if (price === null) {
      hasUnknownModel = true
      continue
    }
    const input = (m.usage.inputTokens * price.inputPerMtok) / 1_000_000
    const output = (m.usage.outputTokens * price.outputPerMtok) / 1_000_000
    const cacheWrite = (m.usage.cacheCreationTokens * price.inputPerMtok * CACHE_WRITE_MULTIPLIER) / 1_000_000
    const cacheRead = (m.usage.cacheReadTokens * price.inputPerMtok * CACHE_READ_MULTIPLIER) / 1_000_000
    usd += input + output + cacheWrite + cacheRead
  }
  return { usd, hasUnknownModel }
}
