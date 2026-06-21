# Project Capabilities — Plan C: MCP Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual "Check health" button to the MCP viewer that probes each `.mcp.json` server (stdio = spawn-and-survive; http/sse = reachability) and shows ok/failed/timeout/unsupported per server.

**Architecture:** A pure spec parser (`.mcp.json` → checkable specs) and a pure check-dispatcher (injected probes — unit-testable) in `core/`; the real side-effecting probes (spawn + fetch with timeout) live in a main-process service; one new IPC channel `mcp:health`; the existing `McpViewerDialog` gains a manual button + per-row status. Health probing **executes user-configured server commands** — it is the one non-read-only feature in the roadmap, so it is gated behind an explicit button and never runs automatically.

**Tech Stack:** Electron 32 (Node 20 — global `fetch` + `child_process.spawn` available), React 18, TypeScript (strict), Vitest, Tailwind.

**Scope note:** Plan C of three (Plan A — commands+skills — merged `d70a79b`; Plan B — transcript+cost — merged `770f375`). Delivers spec section **P4b (MCP health check)**. This completes the roadmap.

**Reference design:** `docs/superpowers/specs/2026-06-20-project-capabilities-roadmap-design.md`

## Verified facts

- `.mcp.json` shape (real sample): `{ "mcpServers": { "<name>": <entry>, ... } }`. A stdio entry is `{ command: string, args?: string[], env?: {} }`; a remote entry is `{ type: "http"|"sse", url: string }`. Files may contain extra keys (e.g. `_comment`) and non-object entries — parse defensively.
- The existing read path (`core/config/mcpConfigReader.ts` → `parseJson`) only extracts `{ name, transport }`; it is NOT rich enough for health (no command/args/url). This plan adds a separate richer parser and leaves the existing reader untouched.
- The existing `McpViewerDialog` (`src/renderer/features/dialogs/McpViewerDialog.tsx`) loads servers via `mcp:read` and renders a name + transport table with a Close-only footer.
- Spawn safety precedent: `src/main/ipc/register.ts` uses `spawn(exe, argsArray, { shell: false, stdio: 'ignore' })` — array args, no shell string. Mirror this (no shell interpolation of `.mcp.json` values).
- Electron 32 main process has global `fetch` (Node 20 / undici) and `AbortController`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `electron/src/core/models/mcp-health.ts` | `HealthStatus` + `HealthResult` types | Create |
| `electron/src/core/models/index.ts` | Re-export new types | Modify |
| `electron/src/core/config/mcpHealthSpec.ts` | Pure `.mcp.json` → `McpServerSpec[]` | Create |
| `electron/tests/core/config/mcpHealthSpec.test.ts` | Parser tests | Create |
| `electron/src/core/health/healthCheck.ts` | Pure check-dispatcher (injected probes) | Create |
| `electron/tests/core/health/healthCheck.test.ts` | Dispatcher tests (fake probes) | Create |
| `electron/src/main/services/mcpHealthStore.ts` | Real probes (spawn + fetch) + orchestration | Create |
| `electron/src/shared/ipc.ts` | `mcp:health` channel | Modify |
| `electron/src/main/ipc/handlers.ts` | `mcp:health` handler | Modify |
| `electron/src/renderer/features/dialogs/McpViewerDialog.tsx` | "Check health" button + status column | Modify |
| `electron/tests/renderer/features/dialogs/McpViewerDialog.test.tsx` | Health button test (extend or create) | Create/Modify |

---

## Task 1: Health result models

**Files:**
- Create: `electron/src/core/models/mcp-health.ts`
- Modify: `electron/src/core/models/index.ts`

- [ ] **Step 1: Create `mcp-health.ts`**

```ts
/** Outcome of a single MCP server health probe. */
export type HealthStatus = 'ok' | 'failed' | 'timeout' | 'unsupported'

/** Health result for one server, keyed by its .mcp.json name. */
export interface HealthResult {
  name: string
  status: HealthStatus
  /** Short human-readable detail (error message, HTTP status, etc.), or null. */
  detail: string | null
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Add (near the other model exports):

```ts
export type { HealthStatus, HealthResult } from './mcp-health'
```

- [ ] **Step 3: Verify compile**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/src/core/models/mcp-health.ts electron/src/core/models/index.ts
git commit -m "feat(core): add MCP HealthStatus + HealthResult models"
```

---

## Task 2: Health spec parser (pure)

**Files:**
- Create: `electron/src/core/config/mcpHealthSpec.ts`
- Test: `electron/tests/core/config/mcpHealthSpec.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseHealthSpecs } from '../../../src/core/config/mcpHealthSpec'

describe('parseHealthSpecs', () => {
  it('parses a stdio server (command + args)', () => {
    const json = JSON.stringify({ mcpServers: { git: { command: 'uvx', args: ['mcp-server-git'] } } })
    const specs = parseHealthSpecs(json)
    expect(specs).toEqual([{ name: 'git', kind: 'stdio', command: 'uvx', args: ['mcp-server-git'], url: null }])
  })

  it('parses http and sse servers (type + url)', () => {
    const json = JSON.stringify({
      mcpServers: {
        remote: { type: 'http', url: 'https://example.com/mcp' },
        stream: { type: 'sse', url: 'https://example.com/sse' },
      },
    })
    const specs = parseHealthSpecs(json)
    expect(specs.find((s) => s.name === 'remote')).toEqual({ name: 'remote', kind: 'http', command: null, args: [], url: 'https://example.com/mcp' })
    expect(specs.find((s) => s.name === 'stream')?.kind).toBe('sse')
  })

  it('marks entries with neither command nor type as unknown', () => {
    const json = JSON.stringify({ mcpServers: { weird: { foo: 'bar' } } })
    expect(parseHealthSpecs(json)[0]).toEqual({ name: 'weird', kind: 'unknown', command: null, args: [], url: null })
  })

  it('defaults missing args to an empty array and ignores non-string args', () => {
    const json = JSON.stringify({ mcpServers: { a: { command: 'x' }, b: { command: 'y', args: ['ok', 5, null] } } })
    const specs = parseHealthSpecs(json)
    expect(specs.find((s) => s.name === 'a')?.args).toEqual([])
    expect(specs.find((s) => s.name === 'b')?.args).toEqual(['ok'])
  })

  it('skips non-object entries (e.g. _comment strings) and never throws', () => {
    const json = JSON.stringify({ _comment: 'note', mcpServers: { real: { command: 'z' } } })
    const specs = parseHealthSpecs(json)
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('real')
  })

  it('returns [] for null / malformed input', () => {
    expect(parseHealthSpecs(null)).toEqual([])
    expect(parseHealthSpecs('{ not json')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/config/mcpHealthSpec.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Pure parser: .mcp.json content → checkable health specs (richer than
 * mcpConfigReader's {name, transport}). Extracts command/args for stdio servers
 * and url for http/sse servers. Defensive: malformed input yields [], never throws.
 */

export type ServerKind = 'stdio' | 'http' | 'sse' | 'unknown'

export interface McpServerSpec {
  name: string
  kind: ServerKind
  command: string | null
  args: string[]
  url: string | null
}

export function parseHealthSpecs(json: string | null): McpServerSpec[] {
  if (json === null) return []
  const result: McpServerSpec[] = []
  try {
    const root: unknown = JSON.parse(json)
    if (typeof root !== 'object' || root === null || Array.isArray(root)) return result
    const servers = (root as Record<string, unknown>)['mcpServers']
    if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return result

    for (const [name, entry] of Object.entries(servers as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const e = entry as Record<string, unknown>

      const type = typeof e['type'] === 'string' ? (e['type'] as string) : null
      const command = typeof e['command'] === 'string' ? (e['command'] as string) : null
      const url = typeof e['url'] === 'string' ? (e['url'] as string) : null
      const args = Array.isArray(e['args'])
        ? (e['args'] as unknown[]).filter((a): a is string => typeof a === 'string')
        : []

      let kind: ServerKind
      if (type === 'http' || type === 'sse') {
        kind = type
      } else if (command !== null) {
        kind = 'stdio'
      } else {
        kind = 'unknown'
      }

      result.push({ name, kind, command, args, url })
    }
  } catch {
    // malformed JSON — return what we have (empty), never throw
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/config/mcpHealthSpec.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/config/mcpHealthSpec.ts electron/tests/core/config/mcpHealthSpec.test.ts
git commit -m "feat(core): add MCP health spec parser"
```

---

## Task 3: Health check dispatcher (pure, injected probes)

**Files:**
- Create: `electron/src/core/health/healthCheck.ts`
- Test: `electron/tests/core/health/healthCheck.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { checkSpec, checkAll, type HealthProbes } from '../../../src/core/health/healthCheck'
import type { McpServerSpec } from '../../../src/core/config/mcpHealthSpec'

function spec(partial: Partial<McpServerSpec> & { name: string; kind: McpServerSpec['kind'] }): McpServerSpec {
  return { command: null, args: [], url: null, ...partial }
}

const okProbes: HealthProbes = {
  probeStdio: async () => ({ ok: true, detail: 'started' }),
  probeHttp: async () => ({ ok: true, detail: 'HTTP 200' }),
}
const failProbes: HealthProbes = {
  probeStdio: async () => ({ ok: false, detail: 'ENOENT' }),
  probeHttp: async () => ({ ok: false, detail: 'ECONNREFUSED' }),
}

describe('checkSpec', () => {
  it('probes a stdio server via probeStdio', async () => {
    const r = await checkSpec(spec({ name: 'git', kind: 'stdio', command: 'uvx' }), okProbes)
    expect(r).toEqual({ name: 'git', status: 'ok', detail: 'started' })
  })

  it('reports failed when the stdio probe fails', async () => {
    const r = await checkSpec(spec({ name: 'git', kind: 'stdio', command: 'uvx' }), failProbes)
    expect(r).toEqual({ name: 'git', status: 'failed', detail: 'ENOENT' })
  })

  it('probes http/sse servers via probeHttp', async () => {
    const r = await checkSpec(spec({ name: 'r', kind: 'http', url: 'https://x' }), okProbes)
    expect(r.status).toBe('ok')
    const s = await checkSpec(spec({ name: 's', kind: 'sse', url: 'https://y' }), okProbes)
    expect(s.status).toBe('ok')
  })

  it('returns unsupported for unknown kind, missing command, or missing url', async () => {
    expect((await checkSpec(spec({ name: 'u', kind: 'unknown' }), okProbes)).status).toBe('unsupported')
    expect((await checkSpec(spec({ name: 'c', kind: 'stdio', command: null }), okProbes)).status).toBe('unsupported')
    expect((await checkSpec(spec({ name: 'h', kind: 'http', url: null }), okProbes)).status).toBe('unsupported')
  })
})

describe('checkAll', () => {
  it('checks every spec and preserves order', async () => {
    const specs = [
      spec({ name: 'a', kind: 'stdio', command: 'x' }),
      spec({ name: 'b', kind: 'http', url: 'https://x' }),
    ]
    const results = await checkAll(specs, okProbes)
    expect(results.map((r) => r.name)).toEqual(['a', 'b'])
    expect(results.every((r) => r.status === 'ok')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/health/healthCheck.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Pure health-check dispatcher. Decides which probe to run per server spec and
 * maps the probe outcome to a HealthResult. Probes are injected so this module
 * is fully unit-testable without spawning processes or making network calls.
 */
import type { McpServerSpec } from '../config/mcpHealthSpec'
import type { HealthResult } from '../models'

export interface ProbeOutcome {
  ok: boolean
  detail: string | null
}

export interface HealthProbes {
  /** Spawn the command and report whether it started without immediately failing. */
  probeStdio(command: string, args: string[]): Promise<ProbeOutcome>
  /** Probe the URL for reachability. */
  probeHttp(url: string): Promise<ProbeOutcome>
}

/** Checks a single spec using the injected probes. */
export async function checkSpec(spec: McpServerSpec, probes: HealthProbes): Promise<HealthResult> {
  if ((spec.kind === 'http' || spec.kind === 'sse') && spec.url !== null) {
    const out = await probes.probeHttp(spec.url)
    return { name: spec.name, status: out.ok ? 'ok' : 'failed', detail: out.detail }
  }
  if (spec.kind === 'stdio' && spec.command !== null) {
    const out = await probes.probeStdio(spec.command, spec.args)
    return { name: spec.name, status: out.ok ? 'ok' : 'failed', detail: out.detail }
  }
  return { name: spec.name, status: 'unsupported', detail: null }
}

/** Checks all specs concurrently, preserving input order. */
export async function checkAll(specs: McpServerSpec[], probes: HealthProbes): Promise<HealthResult[]> {
  return Promise.all(specs.map((s) => checkSpec(s, probes)))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/health/healthCheck.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/health/healthCheck.ts electron/tests/core/health/healthCheck.test.ts
git commit -m "feat(core): add MCP health check dispatcher"
```

---

## Task 4: Real probes + orchestration (main service)

**Files:**
- Create: `electron/src/main/services/mcpHealthStore.ts`

Side-effecting service (no unit test — consistent with the service layer; exercised by manual verification). The `timeout` probe outcome is mapped to `status: 'failed'` with a "timed out" detail by the dispatcher's ok/failed logic — but to surface `timeout` distinctly we set the detail string; the dispatcher only emits ok/failed/unsupported, so timeouts read as `failed` with detail "timed out" (acceptable; the HealthStatus 'timeout' value is reserved for a future explicit mapping and is not produced here).

- [ ] **Step 1: Create `mcpHealthStore.ts`**

```ts
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import type { HealthResult } from '../../core/models'
import { parseHealthSpecs } from '../../core/config/mcpHealthSpec'
import { checkAll, type HealthProbes, type ProbeOutcome } from '../../core/health/healthCheck'
import { readFileUtf8 } from '../os/atomicFile'

const MCP_FILENAME = '.mcp.json'
const PROBE_TIMEOUT_MS = 3000

/**
 * Spawns `command args...` and reports whether it starts without immediately
 * failing. MCP stdio servers run until their stdin closes, so "still alive after
 * a short window" counts as healthy — we then kill the probe process. A spawn
 * error (e.g. command not found) or a fast non-zero exit counts as failed.
 *
 * SECURITY: shell:false + array args — .mcp.json values are never interpreted by
 * a shell. This DOES execute the user's configured server command, which is why
 * health checks are manual-only (never run on scan).
 */
function probeStdio(command: string, args: string[]): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (outcome: ProbeOutcome): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        // already gone
      }
      resolve(outcome)
    }

    const child = spawn(command, args, { shell: false, stdio: 'ignore' })

    child.on('error', (err) => finish({ ok: false, detail: err.message }))
    child.on('exit', (code) => {
      // Exited within the window: 0 is a clean check; non-zero is a failure.
      finish(code === 0 ? { ok: true, detail: 'exited 0' } : { ok: false, detail: `exited ${code ?? 'null'}` })
    })

    const timer = setTimeout(() => finish({ ok: true, detail: 'started' }), PROBE_TIMEOUT_MS)
  })
}

/**
 * Probes a URL for reachability. Any HTTP response (even 4xx/405) means the
 * endpoint is up. A network error or timeout means failed.
 */
async function probeHttp(url: string): Promise<ProbeOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    return { ok: true, detail: `HTTP ${res.status}` }
  } catch (err) {
    const detail = (err as Error)?.name === 'AbortError' ? 'timed out' : (err as Error)?.message ?? 'unreachable'
    return { ok: false, detail }
  } finally {
    clearTimeout(timer)
  }
}

const realProbes: HealthProbes = { probeStdio, probeHttp }

/**
 * Reads <projectPath>/.mcp.json and health-checks every server. Returns [] when
 * the file is absent or has no servers.
 */
export async function checkMcpHealth(projectPath: string): Promise<HealthResult[]> {
  const content = await readFileUtf8(path.join(projectPath, MCP_FILENAME))
  const specs = parseHealthSpecs(content)
  return checkAll(specs, realProbes)
}
```

- [ ] **Step 2: Verify compile**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/src/main/services/mcpHealthStore.ts
git commit -m "feat(main): add MCP health probes (spawn + http) with timeout"
```

---

## Task 5: IPC channel + handler

**Files:**
- Modify: `electron/src/shared/ipc.ts`
- Modify: `electron/src/main/ipc/handlers.ts`

- [ ] **Step 1: Add the model import + channel (`ipc.ts`)**

In the model-type import block, add `HealthResult` (alphabetical — it goes before `LauncherConfig`):

```ts
  GitWorktree,
  HealthResult,
  LauncherConfig,
```

In the `IPC` frozen object, after the `MCP_READ: 'mcp:read',` line, add:

```ts
  MCP_HEALTH: 'mcp:health',
```

- [ ] **Step 2: Add the IpcMap entry (`ipc.ts`)**

After the `'mcp:read'` entry in `IpcMap`, add:

```ts
  'mcp:health': { req: { path: string }; res: HealthResult[] }
```

- [ ] **Step 3: Verify the contract compiles (handler fails next)**

Run: `cd electron && npx tsc --noEmit`
Expected: FAIL — handler map missing `mcp:health`. Expected; Step 4 fixes it.

- [ ] **Step 4: Add the handler (`handlers.ts`)**

After the `import { readMcp } from '../services/mcpStore'` line, add:

```ts
import { checkMcpHealth } from '../services/mcpHealthStore'
```

After the `mcp:read` handler, add:

```ts
    // -----------------------------------------------------------------------
    // mcp:health  (manual-only — executes configured server commands)
    // -----------------------------------------------------------------------
    'mcp:health': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      return checkMcpHealth(projectPath)
    },
```

- [ ] **Step 5: Verify compile + tests**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS. If `handlers.test.ts` asserts the exact set of channel keys, add `mcp:health` to that expectation (do not weaken other assertions). Report if a test needed updating.

- [ ] **Step 6: Commit**

```bash
git add electron/src/shared/ipc.ts electron/src/main/ipc/handlers.ts
git commit -m "feat(ipc): add mcp:health channel"
```

---

## Task 6: McpViewerDialog — "Check health" button + status

**Files:**
- Modify: `electron/src/renderer/features/dialogs/McpViewerDialog.tsx`

Add a manual "Check health" button to the footer. On click it calls `mcp:health`, then renders a status indicator next to each server (keyed by name). Health never runs on open — only on the button.

- [ ] **Step 1: Replace the component body**

```tsx
/**
 * McpViewerDialog — read-only viewer for a project's MCP servers.
 *
 * Displays each server's name + transport (mcp:read). A manual "Check health"
 * button probes every server (mcp:health) and shows ok/failed/unsupported per
 * row. Health is NEVER run automatically — probing executes the server command.
 *
 * IPC: mcp:read (load), mcp:health (manual probe).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { McpServerInfo, HealthResult, ProjectInfo } from '../../../core/models'

export interface McpViewerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function McpViewerDialog({
  open,
  project,
  onClose,
}: McpViewerDialogProps): React.ReactElement {
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [health, setHealth] = useState<Record<string, HealthResult>>({})
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!open) return
    setServers([])
    setError(null)
    setHealth({})
    setChecking(false)
    setLoading(true)

    void window.ccmc.invoke('mcp:read', { path: project.path })
      .then((result) => {
        setServers(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  async function checkHealth(): Promise<void> {
    if (checking) return
    setChecking(true)
    setHealth({})
    try {
      const results = await window.ccmc.invoke('mcp:health', { path: project.path })
      const map: Record<string, HealthResult> = {}
      for (const r of results) map[r.name] = r
      setHealth(map)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const footer = (
    <>
      <Button
        onClick={() => void checkHealth()}
        variant="subtle"
        disabled={checking || servers.length === 0}
      >
        {checking ? 'Checking…' : 'Check health'}
      </Button>
      <Button onClick={onClose} variant="subtle">Close</Button>
    </>
  )

  return (
    <Modal open={open} title={`MCP servers — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading…</p>}

        {!loading && !error && servers.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No MCP servers configured in this project.
          </p>
        )}

        {!loading && servers.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-3 text-xs font-medium text-[var(--text-secondary)] pb-1 border-b border-[var(--divider)]">
              <span className="flex-1">Server name</span>
              <span className="w-24">Transport</span>
              <span className="w-28">Health</span>
            </div>
            {servers.map((server) => {
              const h = health[server.name]
              const color =
                h?.status === 'ok' ? 'text-green-500'
                  : h?.status === 'failed' ? 'text-red-500'
                  : 'text-[var(--text-tertiary)]'
              const label = h ? h.status : checking ? '…' : '—'
              return (
                <div key={server.name} className="flex gap-3 py-1.5 text-sm">
                  <span className="flex-1 font-mono text-[var(--text-primary)] truncate" title={server.name}>
                    {server.name}
                  </span>
                  <span className="w-24 text-[var(--text-secondary)] truncate">
                    {server.transport}
                  </span>
                  <span className={`w-28 ${color}`} title={h?.detail ?? undefined}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Verify compile + existing tests**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS. If `McpViewerDialog.test.tsx` exists and its mock framework requires every invoked channel to be stubbed, note that `mcp:health` is only invoked on button click (not on open), so existing open/render tests should not need it. Report any test changes.

- [ ] **Step 3: Commit**

```bash
git add electron/src/renderer/features/dialogs/McpViewerDialog.tsx
git commit -m "feat(renderer): add manual MCP health check to viewer"
```

---

## Task 7: Dialog test for the health button + manual verification

**Files:**
- Create/Modify: `electron/tests/renderer/features/dialogs/McpViewerDialog.test.tsx`

- [ ] **Step 1: Add a health-button test**

READ the existing `McpViewerDialog.test.tsx` (if present) for its mock helpers (e.g. `setChannelResponse`, `getMockInvoke`). Add `it` blocks (do not weaken existing ones):
- "Check health" button is present and disabled when there are no servers (stub `mcp:read` → `[]`).
- clicking "Check health" with servers present invokes `mcp:health` and renders the status: stub `mcp:read` → `[{ name: 'git', transport: 'uvx' }]` and `mcp:health` → `[{ name: 'git', status: 'ok', detail: 'started' }]`; click the button (by its "Check health" text); assert `ok` appears in the row. Use `findBy*`/`waitFor` since the handler is async.

If no test file exists, create one mirroring another dialog test's mock approach (e.g. `SkillsViewerDialog.test.tsx` from Plan A). Use the project's `ProjectInfo` test fixture.

- [ ] **Step 2: Verify compile + full suite**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS, all green. Report the new test count.

- [ ] **Step 3: Commit**

```bash
git add electron/tests/renderer/features/dialogs/McpViewerDialog.test.tsx
git commit -m "test(renderer): cover MCP health check button"
```

- [ ] **Step 4: Manual verification in the running app**

Per the memory rule (*unit-green ≠ working; launch the app and read main-process logs*):

- Run `npm run dev`; confirm clean main-process startup (no errors).
- Open a project that has a `.mcp.json` (right-click → "View MCP servers…").
- Confirm the server list shows, every row's Health is `—` initially (health did NOT auto-run).
- Click "Check health". Confirm: button shows "Checking…", then each row shows `ok` / `failed` / `unsupported`. Hover a status to see the detail tooltip.
- Verify a known-good stdio server (e.g. a python-based one) reports `ok`, and a deliberately-broken one (rename its command) reports `failed` with an error detail.
- Confirm no main-process crash from spawning the probe processes (they should be killed after the window).
- Commit any fixups.

---

## Self-Review (completed by plan author)

**Spec coverage (P4b):**
- "Health-check behind an explicit button, never automatic" → Task 6: `checkHealth` runs only on the button; the open-effect does not call `mcp:health`. ✅
- "http/sse → cheap HTTP probe; stdio → spawn with timeout, report started/failed" → Task 4: `probeHttp` (fetch + abort timeout), `probeStdio` (spawn, survive-window = started, error/non-zero-exit = failed). ✅
- "same spawn-safety as existing launches (array args, no shell)" → Task 4: `spawn(command, args, { shell: false, stdio: 'ignore' })`, mirrors `register.ts`. ✅
- "new `mcp:health` IPC" → Task 5. ✅
- Surface status in `McpViewerDialog` → Task 6 (per-row status column + tooltip detail). ✅

**Placeholder scan:** No TBD/TODO; every code step is complete. ✅

**Type consistency:** `HealthStatus`/`HealthResult` consistent across model, dispatcher, store, IPC res, and dialog. `McpServerSpec`/`ServerKind` consistent across parser, dispatcher, and store. `HealthProbes`/`ProbeOutcome` consistent across dispatcher and store. Channel `mcp:health` consistent across `IPC`, `IpcMap`, handler, dialog. Function names `parseHealthSpecs`/`checkSpec`/`checkAll`/`checkMcpHealth`/`probeStdio`/`probeHttp` consistent. ✅

**Known limitation (documented, not a gap):** the `HealthStatus` union includes `'timeout'`, but the dispatcher only emits `ok`/`failed`/`unsupported` — a stdio timeout reads as `started` (ok) by design (a server that stays alive IS healthy), and an http timeout reads as `failed` with detail "timed out". The `'timeout'` value is reserved for a future explicit mapping. This is intentional; no task produces a bare `'timeout'` status.

**Security note:** health probing executes user-configured `.mcp.json` commands. This is the one non-read-only feature in the roadmap. Mitigations: manual-only (never on scan), `shell:false` + array args (no shell injection from config values), probe processes killed after a 3s window, and the command source is the user's own project config (not network/attacker input).
