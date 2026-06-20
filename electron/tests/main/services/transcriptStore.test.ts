/**
 * Integration tests for transcriptStore against a real temp filesystem.
 * Complements the pure-parser unit tests by exercising the actual
 * file I/O path and cost calculation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { readTranscript, projectCost } from '../../../src/main/services/transcriptStore'
import { encodeProjectPath } from '../../../src/core/claude/sessionLister'

let claudeBase: string
const projectPath = 'C:\\Dev\\Active\\Demo'
const sessionId = 'sess-1'

beforeAll(async () => {
  claudeBase = await fs.mkdtemp(path.join(os.tmpdir(), 'ccmc-tx-'))
  const dir = path.join(claudeBase, 'projects', encodeProjectPath(projectPath))
  await fs.mkdir(dir, { recursive: true })
  const lines = [
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'hello' } }),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-01-01T00:01:00Z',
      message: {
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'hi there' }],
        usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }),
  ]
  await fs.writeFile(path.join(dir, `${sessionId}.jsonl`), lines.join('\n'))
})

afterAll(async () => {
  await fs.rm(claudeBase, { recursive: true, force: true })
})

describe('readTranscript (fs integration)', () => {
  it('reads + parses a session transcript', async () => {
    const msgs = await readTranscript(claudeBase, projectPath, sessionId)
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].text).toContain('hi there')
  })

  it('returns [] for a missing session', async () => {
    expect(await readTranscript(claudeBase, projectPath, 'nope')).toEqual([])
  })
})

describe('projectCost (fs integration)', () => {
  it('sums cost across the project transcripts', async () => {
    const cost = await projectCost(claudeBase, projectPath)
    expect(cost.sessionCount).toBe(1)
    expect(cost.usd).toBeCloseTo(3, 6) // sonnet, 1M input tokens = $3
    expect(cost.hasUnknownModel).toBe(false)
  })

  it('returns zeros for an unknown project', async () => {
    expect(await projectCost(claudeBase, 'C:\\nope')).toEqual({ usd: 0, hasUnknownModel: false, sessionCount: 0 })
  })
})
