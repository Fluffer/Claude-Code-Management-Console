/**
 * Model pricing (USD per million tokens), 2026-01 Anthropic list prices.
 * MAINTAINED CONSTANT — verify periodically against current pricing.
 *
 * Cache costs are derived from the base input price using Anthropic's standard
 * multipliers (see exports below): cache write (5-minute) = 1.25x input,
 * cache read = 0.10x input. Matching is by family substring so new point
 * releases price without a table edit. Unknown model → null (cost "unknown").
 */
export interface ModelPrice {
  /** USD per million input tokens. */
  inputPerMtok: number
  /** USD per million output tokens. */
  outputPerMtok: number
}

const FAMILY_PRICES: ReadonlyArray<readonly [RegExp, ModelPrice]> = [
  [/opus/i, { inputPerMtok: 15, outputPerMtok: 75 }],
  [/sonnet/i, { inputPerMtok: 3, outputPerMtok: 15 }],
  [/haiku/i, { inputPerMtok: 1, outputPerMtok: 5 }],
]

/** Cache-write (5-minute) multiplier applied to the base input price. */
export const CACHE_WRITE_MULTIPLIER = 1.25
/** Cache-read multiplier applied to the base input price. */
export const CACHE_READ_MULTIPLIER = 0.1

/** Returns the price for a model id, or null when the family is unknown. */
export function priceFor(model: string | null): ModelPrice | null {
  if (!model) return null
  for (const [re, price] of FAMILY_PRICES) {
    if (re.test(model)) return price
  }
  return null
}
