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
