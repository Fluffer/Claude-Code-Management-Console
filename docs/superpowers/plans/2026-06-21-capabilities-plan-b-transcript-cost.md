# Project Capabilities — Plan B: Transcript Browser + Cost Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse/search past session transcripts and see per-session + per-project token cost, by parsing the `~/.claude/projects/<encoded>/<sessionId>.jsonl` transcripts the Claude CLI already writes.

**Architecture:** Pure parser + pure cost calculator in `core/` (unit-tested, never throw), thin fs services in `main/services/`, two new IPC channels (`sessions:readTranscript`, `sessions:cost`), and an upgrade of the existing `ResumeSessionDialog` into a two-pane browser (session list + transcript preview + search + cost). Reuses the existing `encodeProjectPath` + session enumeration patterns. Cost is computed from the `usage` block on assistant transcript lines × a maintained price table.

**Tech Stack:** Electron 32, React 18, TypeScript (strict), Vitest, Tailwind. electron-vite build.

**Scope note:** Plan B of three (Plan A — commands+skills — already merged; Plan C — MCP health — separate). Delivers spec sections **P2 (session/transcript browser)** and **P4a (cost tracking)**. P4b (MCP health) is out of scope.

**Reference design:** `docs/superpowers/specs/2026-06-20-project-capabilities-roadmap-design.md`

## Verified data facts (from real transcripts on disk)

- Transcript files live at `<claudeBaseDir>/projects/<encodeProjectPath(projectPath)>/<sessionId>.jsonl`. `encodeProjectPath` = `projectPath.replace(/[^A-Za-z0-9]/g, '-')` (already exported from `core/claude/sessionLister.ts`).
- Each line is a JSON object. Top-level keys include `type`, `timestamp` (ISO-8601), `message`.
- `type` is one of `user`, `assistant`, plus non-message kinds (`summary`, `file-history-snapshot`, `system`, …) which have no usable `message` and must be skipped.
- `message.role` is `user`/`assistant`; `message.content` is `string` OR an array of blocks (`{type:'text',text}`, `{type:'thinking',thinking}`, `{type:'tool_use',name,…}`, `{type:'tool_result',…}`).
- Assistant lines carry `message.model` (e.g. `claude-opus-4-7`, `claude-sonnet-4-6`) and **sometimes** `message.usage`. **`usage` is `null` on many assistant lines** (e.g. thinking-only chunks) — only completed messages carry it. The parser must tolerate null/absent usage.
- `usage` shape: `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }` (standard Anthropic usage object).

## Pricing facts

List prices (USD per million tokens), per the 2026-01 Anthropic price list. **Maintained constant — verify periodically.** Cache costs are derived from base input price using Anthropic's standard multipliers: cache write (5-minute) = 1.25× input, cache read = 0.10× input. Matching is by family substring so new point releases price without a table edit. Unknown model → null price → cost reported as "unknown".

| Family (substring match) | input $/Mtok | output $/Mtok |
|---|---|---|
| `opus` | 15 | 75 |
| `sonnet` | 3 | 15 |
| `haiku` | 1 | 5 |
| anything else (e.g. `fable`) | — | — (unknown) |

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `electron/src/core/models/transcript-message.ts` | `TranscriptMessage` + `TokenUsage` types | Create |
| `electron/src/core/models/index.ts` | Re-export new types | Modify |
| `electron/src/core/claude/transcriptParser.ts` | Pure jsonl → `TranscriptMessage[]` | Create |
| `electron/tests/core/claude/transcriptParser.test.ts` | Parser tests | Create |
| `electron/src/core/cost/priceTable.ts` | Pure model → price (family match) | Create |
| `electron/tests/core/cost/priceTable.test.ts` | Price table tests | Create |
| `electron/src/core/cost/costCalculator.ts` | Pure usage → USD | Create |
| `electron/tests/core/cost/costCalculator.test.ts` | Cost calc tests | Create |
| `electron/src/main/services/transcriptStore.ts` | Read one transcript + sum project cost | Create |
| `electron/src/shared/ipc.ts` | Two new channels | Modify |
| `electron/src/main/ipc/handlers.ts` | Two new handlers (with sessionId guard) | Modify |
| `electron/src/renderer/features/dialogs/ResumeSessionDialog.tsx` | Upgrade to two-pane browser + cost | Modify |
| `electron/tests/renderer/features/dialogs/ResumeSessionDialog.test.tsx` | Browser tests (extend or create) | Create/Modify |

---

## Task 1: TranscriptMessage + TokenUsage models

**Files:**
- Create: `electron/src/core/models/transcript-message.ts`
- Modify: `electron/src/core/models/index.ts`

- [ ] **Step 1: Create `transcript-message.ts`**

```ts
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
```

- [ ] **Step 2: Re-export from `index.ts`**

Add (keep alphabetical-ish ordering, near the `SessionSummary`/`SkillInfo` exports):

```ts
export type { TokenUsage, TranscriptMessage } from './transcript-message'
```

- [ ] **Step 3: Verify compile**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/src/core/models/transcript-message.ts electron/src/core/models/index.ts
git commit -m "feat(core): add TranscriptMessage + TokenUsage models"
```

---

## Task 2: Transcript parser (pure)

**Files:**
- Create: `electron/src/core/claude/transcriptParser.ts`
- Test: `electron/tests/core/claude/transcriptParser.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/claude/transcriptParser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/claude/transcriptParser.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/claude/transcriptParser.ts electron/tests/core/claude/transcriptParser.test.ts
git commit -m "feat(core): add transcript jsonl parser"
```

---

## Task 3: Price table (pure)

**Files:**
- Create: `electron/src/core/cost/priceTable.ts`
- Test: `electron/tests/core/cost/priceTable.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/cost/priceTable.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/cost/priceTable.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/cost/priceTable.ts electron/tests/core/cost/priceTable.test.ts
git commit -m "feat(core): add model price table"
```

---

## Task 4: Cost calculator (pure)

**Files:**
- Create: `electron/src/core/cost/costCalculator.ts`
- Test: `electron/tests/core/cost/costCalculator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/cost/costCalculator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/cost/costCalculator.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/cost/costCalculator.ts electron/tests/core/cost/costCalculator.test.ts
git commit -m "feat(core): add cost calculator"
```

---

## Task 5: Transcript store (main service)

**Files:**
- Create: `electron/src/main/services/transcriptStore.ts`

Thin fs wrapper (no unit test — consistent with the service layer; covered by an integration test in Task 8's verification step and exercised via IPC).

- [ ] **Step 1: Create `transcriptStore.ts`**

```ts
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { TranscriptMessage } from '../../core/models'
import { encodeProjectPath } from '../../core/claude/sessionLister'
import { parseTranscript } from '../../core/claude/transcriptParser'
import { computeCost, type CostResult } from '../../core/cost/costCalculator'
import { readFileUtf8 } from '../os/atomicFile'

function projectDir(claudeBaseDir: string, projectPath: string): string {
  return path.join(claudeBaseDir, 'projects', encodeProjectPath(projectPath))
}

/**
 * Reads and parses a single session transcript.
 * `sessionId` must be a bare file stem (no path separators) — the IPC handler
 * validates this before calling. Returns [] when the file is absent.
 */
export async function readTranscript(
  claudeBaseDir: string,
  projectPath: string,
  sessionId: string,
): Promise<TranscriptMessage[]> {
  const file = path.join(projectDir(claudeBaseDir, projectPath), `${sessionId}.jsonl`)
  const content = await readFileUtf8(file)
  return parseTranscript(content)
}

export interface ProjectCost extends CostResult {
  /** Number of session transcripts summed. */
  sessionCount: number
}

/**
 * Sums the cost of every session transcript for a project. Reads each *.jsonl
 * under the project's transcript dir. Returns zeros when the dir is absent.
 */
export async function projectCost(claudeBaseDir: string, projectPath: string): Promise<ProjectCost> {
  const dir = projectDir(claudeBaseDir, projectPath)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return { usd: 0, hasUnknownModel: false, sessionCount: 0 }
  }
  const files = entries.filter((f) => f.endsWith('.jsonl'))
  let usd = 0
  let hasUnknownModel = false
  for (const f of files) {
    const content = await readFileUtf8(path.join(dir, f))
    const cost = computeCost(parseTranscript(content))
    usd += cost.usd
    if (cost.hasUnknownModel) hasUnknownModel = true
  }
  return { usd, hasUnknownModel, sessionCount: files.length }
}
```

- [ ] **Step 2: Verify compile**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/src/main/services/transcriptStore.ts
git commit -m "feat(main): add transcript read + project cost store"
```

---

## Task 6: IPC channels + handlers

**Files:**
- Modify: `electron/src/shared/ipc.ts`
- Modify: `electron/src/main/ipc/handlers.ts`

- [ ] **Step 1: Add the model import + channels (`ipc.ts`)**

In the model-type import block, add `TranscriptMessage`:

```ts
  SessionSummary,
  SkillInfo,
  TranscriptMessage,
} from '../core/models'
```

In the `IPC` frozen object, after the `SESSIONS_KILL: 'sessions:kill',` line, add:

```ts
  SESSIONS_READ_TRANSCRIPT: 'sessions:readTranscript',
  SESSIONS_COST: 'sessions:cost',
```

- [ ] **Step 2: Add the IpcMap entries (`ipc.ts`)**

After the `'sessions:kill'` entry in `IpcMap`, add:

```ts
  'sessions:readTranscript': {
    req: { projectPath: string; sessionId: string }
    res: TranscriptMessage[]
  }
  'sessions:cost': {
    req: { projectPath: string }
    res: { usd: number; hasUnknownModel: boolean; sessionCount: number }
  }
```

- [ ] **Step 3: Verify the contract compiles (handlers will fail next)**

Run: `cd electron && npx tsc --noEmit`
Expected: FAIL — handlers map missing the two new channels. Expected; Step 4 fixes it.

- [ ] **Step 4: Add handler imports + handlers (`handlers.ts`)**

After the `import { listSessions } from '../services/claudeSessionStore'` line, add:

```ts
import { readTranscript, projectCost } from '../services/transcriptStore'
```

After the `sessions:kill` handler, add (note the `sessionId` path-traversal guard):

```ts
    // -----------------------------------------------------------------------
    // sessions:readTranscript
    // -----------------------------------------------------------------------
    'sessions:readTranscript': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['projectPath'], 'projectPath')
      const sessionId = requireString(obj['sessionId'], 'sessionId')
      // sessionId is a bare file stem; reject anything that could escape the dir.
      if (/[\\/]/.test(sessionId) || sessionId.includes('..')) {
        throw new Error("IPC validation: 'sessionId' must be a bare session id")
      }
      return readTranscript(claudeDir, projectPath, sessionId)
    },

    // -----------------------------------------------------------------------
    // sessions:cost
    // -----------------------------------------------------------------------
    'sessions:cost': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['projectPath'], 'projectPath')
      return projectCost(claudeDir, projectPath)
    },
```

(`claudeDir` is already in scope in `createHandlers` — it is used by `sessions:listHistory` at the existing `listSessions(projectPath, claudeDir)` call.)

- [ ] **Step 5: Verify compile + tests**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS. The existing `handlers.test.ts` builds a handler map; if it asserts the exact set of channel keys, add `sessions:readTranscript` and `sessions:cost` to that expectation (do not weaken other assertions). Report if a test needed updating.

- [ ] **Step 6: Commit**

```bash
git add electron/src/shared/ipc.ts electron/src/main/ipc/handlers.ts
git commit -m "feat(ipc): add sessions:readTranscript + sessions:cost channels"
```

---

## Task 7: Upgrade ResumeSessionDialog into a transcript browser

**Files:**
- Modify: `electron/src/renderer/features/dialogs/ResumeSessionDialog.tsx`

Turn the single-column resume picker into a two-pane browser: left = session list (existing behavior + per-row selection drives the preview), right = transcript preview with a text filter; a header line shows the project cost; the Resume button is preserved. Lazy-load the transcript only on selection.

- [ ] **Step 1: Replace the component with the two-pane version**

```tsx
/**
 * ResumeSessionDialog — session browser + resume.
 *
 * Left pane: resumable sessions (sessions:listHistory). Selecting one loads its
 * transcript (sessions:readTranscript, lazy) into the right pane, which offers a
 * text filter. The header shows total project cost (sessions:cost, loaded once).
 * Resume launches `claude --resume <sessionId>` (unchanged).
 *
 * IPC: sessions:listHistory, sessions:readTranscript, sessions:cost, launch:run
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { formatRelativeTime } from '../../../core/util/relativeTimeFormatter'
import { computeCost } from '../../../core/cost/costCalculator'
import type { ProjectInfo, SessionSummary, TranscriptMessage } from '../../../core/models'

export interface ResumeSessionDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

/** Formats a USD amount: `$1.23`, `<$0.01` for tiny non-zero, `$0.00` for zero. */
function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export function ResumeSessionDialog({
  open,
  project,
  onClose,
}: ResumeSessionDialogProps): React.ReactElement {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [projectCostLabel, setProjectCostLabel] = useState<string | null>(null)

  // Load the session list + project cost when the dialog opens.
  useEffect(() => {
    if (!open) return
    setSessions([])
    setSelectedSessionId(null)
    setSubmitting(false)
    setTranscript([])
    setFilter('')
    setProjectCostLabel(null)
    setLoading(true)

    void window.ccmc
      .invoke('sessions:listHistory', { projectPath: project.path })
      .then((result) => {
        setSessions(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    void window.ccmc
      .invoke('sessions:cost', { projectPath: project.path })
      .then((cost) => {
        const label = formatUsd(cost.usd) + (cost.hasUnknownModel ? ' +unknown' : '')
        setProjectCostLabel(`${label} · ${cost.sessionCount} session${cost.sessionCount === 1 ? '' : 's'}`)
      })
      .catch(() => setProjectCostLabel(null))
  }, [open, project.path])

  // Lazy-load the selected session's transcript.
  useEffect(() => {
    if (!open || selectedSessionId === null) {
      setTranscript([])
      return
    }
    let cancelled = false
    setTranscriptLoading(true)
    setTranscript([])
    void window.ccmc
      .invoke('sessions:readTranscript', { projectPath: project.path, sessionId: selectedSessionId })
      .then((msgs) => {
        if (cancelled) return
        setTranscript(msgs)
        setTranscriptLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setTranscriptLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedSessionId, project.path])

  async function handleResume(): Promise<void> {
    if (!selectedSessionId || submitting) return
    setSubmitting(true)
    try {
      const result = await window.ccmc.invoke('launch:run', {
        projectName: project.name,
        projectPath: project.path,
        continueSession: false,
        flags: `--resume ${selectedSessionId}`,
      })
      if (!result.ok) {
        setSubmitting(false)
        return
      }
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  const now = new Date()
  const sessionCost = computeCost(transcript)
  const visible = filter.trim()
    ? transcript.filter((m) => m.text.toLowerCase().includes(filter.toLowerCase()))
    : transcript

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleResume()} disabled={!selectedSessionId || submitting}>
        {submitting ? 'Resuming…' : 'Resume'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Sessions" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-2 min-w-[720px]">
        {projectCostLabel && (
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Project cost: <span className="font-mono">{projectCostLabel}</span>
          </p>
        )}

        <div className="flex gap-3">
          {/* Left: session list */}
          <div className="w-72 flex-shrink-0">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="md" label="Loading sessions…" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4 opacity-70">
                No previous sessions found for this project.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto -mx-1">
                {sessions.map((session) => {
                  const display = session.firstUserMessage || session.sessionId
                  const relTime = formatRelativeTime(new Date(session.lastWriteUtc), now)
                  const isSelected = session.sessionId === selectedSessionId
                  return (
                    <li
                      key={session.sessionId}
                      className={[
                        'flex flex-col px-2 py-1.5 rounded cursor-pointer text-sm',
                        isSelected
                          ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                          : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                      ].join(' ')}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                    >
                      <span className="truncate">{display}</span>
                      <span
                        className={[
                          'text-[11px]',
                          isSelected ? 'opacity-75' : 'text-[var(--text-tertiary)]',
                        ].join(' ')}
                      >
                        {relTime}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Right: transcript preview */}
          <div className="flex-1 min-w-0 border-l border-[var(--divider)] pl-3">
            {selectedSessionId === null ? (
              <p className="text-sm text-[var(--text-secondary)] py-4 opacity-70">
                Select a session to preview its transcript.
              </p>
            ) : transcriptLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="md" label="Loading transcript…" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter messages…"
                    className="flex-1 px-2 py-1 text-sm rounded bg-[var(--subtle-fill)] text-[var(--text-primary)] focus:outline-none"
                  />
                  <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0 font-mono">
                    {formatUsd(sessionCost.usd)}{sessionCost.hasUnknownModel ? ' +?' : ''}
                  </span>
                </div>
                <ul className="max-h-72 overflow-y-auto flex flex-col gap-2">
                  {visible.length === 0 ? (
                    <li className="text-xs text-[var(--text-secondary)] opacity-70">No messages.</li>
                  ) : (
                    visible.map((m, i) => (
                      <li key={i} className="text-xs">
                        <span
                          className={[
                            'font-medium',
                            m.role === 'assistant' ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
                          ].join(' ')}
                        >
                          {m.role}
                          {m.model ? ` · ${m.model}` : ''}
                        </span>
                        <p className="whitespace-pre-wrap break-words text-[var(--text-primary)] mt-0.5">
                          {m.text || '—'}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Verify compile + existing tests**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS. If `ResumeSessionDialog.test.tsx` exists and asserts old single-column markup (e.g. the old title "Resume a session"), update those assertions to the new title "Sessions" and structure (do NOT weaken behavior assertions — resume still works the same). Report any test changes.

- [ ] **Step 3: Commit**

```bash
git add electron/src/renderer/features/dialogs/ResumeSessionDialog.tsx
git commit -m "feat(renderer): upgrade ResumeSessionDialog to transcript browser + cost"
```

---

## Task 8: Tests for the browser + store integration, then manual verification

**Files:**
- Create/Modify: `electron/tests/renderer/features/dialogs/ResumeSessionDialog.test.tsx`
- Create: `electron/tests/main/services/transcriptStore.test.ts`

- [ ] **Step 1: Add a store fs-integration test**

Mirror `tests/main/services/capabilityStores.test.ts` (temp dir via `fs.mkdtemp`). Create `electron/tests/main/services/transcriptStore.test.ts`:

```ts
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
```

- [ ] **Step 2: Add/adjust the dialog test**

If `ResumeSessionDialog.test.tsx` exists, READ it and update for the new two-pane structure. If it does not exist, create `electron/tests/renderer/features/dialogs/ResumeSessionDialog.test.tsx` mirroring `McpViewerDialog.test.tsx`'s mocking approach. Minimum cases:
- renders the session list from `sessions:listHistory`.
- selecting a session calls `sessions:readTranscript` and renders the returned messages.
- the project cost header renders from `sessions:cost` (e.g. mock `{ usd: 3, hasUnknownModel: false, sessionCount: 1 }` → assert `$3.00` and `1 session` appear).
- the filter input narrows the visible messages.
- Resume disabled until a session is selected; clicking it calls `launch:run` with `flags: '--resume <id>'`.

Use whatever `window.ccmc` mock helper the other dialog tests use; make `sessions:readTranscript` resolve a small `TranscriptMessage[]`.

- [ ] **Step 3: Verify compile + full suite**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS, all green. Report the new test count.

- [ ] **Step 4: Commit**

```bash
git add electron/tests/main/services/transcriptStore.test.ts electron/tests/renderer/features/dialogs/ResumeSessionDialog.test.tsx
git commit -m "test: cover transcript store + session browser"
```

- [ ] **Step 5: Manual verification in the running app**

Per the memory rule (*unit-green ≠ working; launch the app and read main-process logs*):

- Run `npm run dev`; confirm clean main-process startup (no errors).
- Open a project that has session history (right-click → "Resume session…").
- Confirm: session list loads; selecting a session shows its transcript on the right; the filter narrows messages; the project-cost header shows a dollar figure; Resume still launches `claude --resume <id>`.
- Pick a project whose sessions used a Fable model (or any unpriced model) and confirm the cost shows the `+unknown` / `+?` marker rather than a wrong number.
- Commit any fixups.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- P2 session/transcript browser → Tasks 1, 2, 5, 6, 7, 8. New `sessions:readTranscript` IPC + pure `transcriptParser`; ResumeSessionDialog upgraded with list + preview pane + text search; resume preserved; lazy-load on selection (Task 7 effect keyed on `selectedSessionId`). ✅
- P4a cost tracking → Tasks 3, 4, 5, 6, 7. `priceTable` (4 token classes via derived cache multipliers — keeps input/output explicit, cache derived), `costCalculator`, surfaced per-session in the preview header and per-project in the dialog header. Unknown-model fallback marks "unknown" rather than guessing. ✅
- Perf mitigation (spec: "lazy-load preview", "cap excerpt") → excerpt capped at 2000 chars in the parser; transcript loaded only on selection. ✅
- **Deliberate deviation from spec:** spec suggested per-project cost as a *row badge in enrichment*. This plan surfaces it in the **session-browser header via an on-demand `sessions:cost` IPC** instead, to avoid reading+parsing every transcript on each always-on enrichment pass (the perf risk the spec itself flagged). A cached row-badge can be a later optimization. Documented here and in the dialog. ✅
- Security: `sessions:readTranscript` validates `sessionId` is a bare stem (rejects `/`, `\`, `..`) before building the path — prevents traversal out of the project transcript dir. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `TranscriptMessage`/`TokenUsage` field names (`inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`) are consistent across parser, models, calculator, and tests. `CostResult { usd, hasUnknownModel }` and `ProjectCost extends CostResult { sessionCount }` consistent across store, IPC res type, and dialog. Channel strings `sessions:readTranscript` / `sessions:cost` consistent across `IPC`, `IpcMap`, handlers, dialog. `priceFor`/`computeCost`/`parseTranscript` names consistent. ✅

**Pricing caveat:** prices are 2026-01 list prices embedded as maintained config; the table is the single edit point and unknown models degrade to "unknown" rather than mispricing. (Could not load the claude-api skill at plan time due to a transient tool outage — verify the three family prices against current Anthropic pricing before shipping.)
