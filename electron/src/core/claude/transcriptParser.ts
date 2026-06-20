/**
 * Pure parser: a session transcript's jsonl text → TranscriptMessage[].
 * File reading is the caller's responsibility. Defensive: malformed lines are
 * skipped, never thrown. Mirrors the never-throw style of sessionLister.
 */
import type { TranscriptMessage, TokenUsage } from '../models'

const MAX_EXCERPT = 2000

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function parseUsage(u: unknown): TokenUsage | null {
  if (typeof u !== 'object' || u === null) return null
  const o = u as Record<string, unknown>
  return {
    inputTokens: num(o['input_tokens']),
    outputTokens: num(o['output_tokens']),
    cacheCreationTokens: num(o['cache_creation_input_tokens']),
    cacheReadTokens: num(o['cache_read_input_tokens']),
  }
}

function extractExcerpt(content: unknown): string {
  if (typeof content === 'string') return content.slice(0, MAX_EXCERPT)
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const b of content) {
    if (typeof b !== 'object' || b === null) continue
    const blk = b as Record<string, unknown>
    switch (blk['type']) {
      case 'text':
        if (typeof blk['text'] === 'string') parts.push(blk['text'])
        break
      case 'thinking':
        if (typeof blk['thinking'] === 'string') parts.push('[thinking] ' + blk['thinking'])
        break
      case 'tool_use':
        parts.push(`[tool: ${typeof blk['name'] === 'string' ? blk['name'] : 'unknown'}]`)
        break
      case 'tool_result':
        parts.push('[tool result]')
        break
      default:
        break
    }
  }
  return parts.join('\n').slice(0, MAX_EXCERPT)
}

export function parseTranscript(jsonl: string | null): TranscriptMessage[] {
  if (!jsonl) return []
  const out: TranscriptMessage[] = []
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue
    let root: unknown
    try {
      root = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof root !== 'object' || root === null) continue
    const o = root as Record<string, unknown>
    const type = o['type']
    if (type !== 'user' && type !== 'assistant') continue
    const msg =
      typeof o['message'] === 'object' && o['message'] !== null
        ? (o['message'] as Record<string, unknown>)
        : {}
    const role = msg['role'] === 'assistant' ? 'assistant' : 'user'
    out.push({
      role,
      text: extractExcerpt(msg['content']),
      timestamp: typeof o['timestamp'] === 'string' ? o['timestamp'] : null,
      model: typeof msg['model'] === 'string' ? msg['model'] : null,
      usage: parseUsage(msg['usage']),
    })
  }
  return out
}
