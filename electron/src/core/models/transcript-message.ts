/** Token counts from a single assistant message's `usage` block. */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

/** One displayable message parsed from a session transcript jsonl. */
export interface TranscriptMessage {
  role: 'user' | 'assistant'
  /** Excerpt of the message text/blocks (capped length). */
  text: string
  /** ISO-8601 timestamp, or null if absent. */
  timestamp: string | null
  /** Model id for assistant messages, else null. */
  model: string | null
  /** Token usage when present (assistant, completed messages), else null. */
  usage: TokenUsage | null
}
