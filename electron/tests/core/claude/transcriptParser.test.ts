import { describe, it, expect } from 'vitest'
import { parseTranscript } from '../../../src/core/claude/transcriptParser'

function line(obj: unknown): string {
  return JSON.stringify(obj)
}

describe('parseTranscript', () => {
  it('parses a user string message', () => {
    const jsonl = line({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'hello' } })
    const msgs = parseTranscript(jsonl)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ role: 'user', text: 'hello', timestamp: '2026-01-01T00:00:00Z', model: null, usage: null })
  })

  it('parses an assistant message with model, text block, and usage', () => {
    const jsonl = line({
      type: 'assistant',
      timestamp: '2026-01-01T00:01:00Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-7',
        content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'the answer' }],
        usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 200 },
      },
    })
    const m = parseTranscript(jsonl)[0]
    expect(m.role).toBe('assistant')
    expect(m.model).toBe('claude-opus-4-7')
    expect(m.text).toContain('the answer')
    expect(m.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheCreationTokens: 100, cacheReadTokens: 200 })
  })

  it('treats assistant lines with null usage as usage:null', () => {
    const jsonl = line({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-4-7', content: [{ type: 'thinking', thinking: 'x' }], usage: null } })
    expect(parseTranscript(jsonl)[0].usage).toBeNull()
  })

  it('skips non-message line types (summary, snapshots) and blank lines', () => {
    const jsonl = [
      line({ type: 'summary', summary: 'x' }),
      '',
      line({ type: 'file-history-snapshot', snapshot: {} }),
      line({ type: 'user', message: { role: 'user', content: 'real' } }),
    ].join('\n')
    const msgs = parseTranscript(jsonl)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('real')
  })

  it('renders tool_use / tool_result blocks as placeholders', () => {
    const jsonl = line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] } })
    expect(parseTranscript(jsonl)[0].text).toContain('[tool: Bash]')
  })

  it('never throws on malformed json and returns [] for null', () => {
    expect(parseTranscript('{ not json')).toEqual([])
    expect(parseTranscript(null)).toEqual([])
  })
})
