/**
 * End-to-end regression tests for the stdio MCP health probe.
 *
 * These spawn real processes on purpose: the bug they cover (Node ≥20.12
 * refusing to spawn a .cmd with shell:false, throwing EINVAL) is invisible to
 * a mocked child_process. `npx` — the command behind most .mcp.json stdio
 * servers on Windows — is exactly such a .cmd shim.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { checkMcpHealth } from '../../../src/main/services/mcpHealthStore'

const isWindows = process.platform === 'win32'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-health-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

async function writeMcpJson(servers: Record<string, unknown>): Promise<void> {
  await fs.writeFile(path.join(tmpDir, '.mcp.json'), JSON.stringify({ mcpServers: servers }), 'utf8')
}

describe('checkMcpHealth', () => {
  it('returns [] when .mcp.json is absent', async () => {
    expect(await checkMcpHealth(tmpDir)).toEqual([])
  })

  it.runIf(isWindows)('reports a .cmd shim server as ok (regression: spawn EINVAL)', async () => {
    const shim = path.join(tmpDir, 'fake-npx.cmd')
    await fs.writeFile(shim, '@echo off\r\nexit /b 0\r\n', 'utf8')
    await writeMcpJson({ shimmed: { command: shim, args: ['-y', 'some-server'] } })

    const results = await checkMcpHealth(tmpDir)

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('shimmed')
    expect(results[0].status).toBe('ok')
  })

  it.runIf(isWindows)('reports a failing .cmd shim server as failed, not ok', async () => {
    const shim = path.join(tmpDir, 'failing.cmd')
    await fs.writeFile(shim, '@echo off\r\nexit /b 3\r\n', 'utf8')
    await writeMcpJson({ broken: { command: shim, args: [] } })

    const results = await checkMcpHealth(tmpDir)

    expect(results[0].status).toBe('failed')
    expect(results[0].detail).toBe('exited 3')
  })

  it.runIf(isWindows)('handles a .cmd shim living under a path with spaces', async () => {
    const dir = path.join(tmpDir, 'Program Files Like')
    await fs.mkdir(dir, { recursive: true })
    const shim = path.join(dir, 'spaced shim.cmd')
    await fs.writeFile(shim, '@echo off\r\nexit /b 0\r\n', 'utf8')
    await writeMcpJson({ spaced: { command: shim, args: ['an arg with spaces'] } })

    const results = await checkMcpHealth(tmpDir)

    expect(results[0].status).toBe('ok')
  })

  it('reports a non-existent command as failed without rejecting', async () => {
    await writeMcpJson({
      missing: { command: path.join(tmpDir, 'does-not-exist-xyz.exe'), args: [] },
    })

    const results = await checkMcpHealth(tmpDir)

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('failed')
  })

  it('one broken server does not take down the whole report', async () => {
    await writeMcpJson({
      broken: { command: path.join(tmpDir, 'does-not-exist-xyz.exe'), args: [] },
      unsupported: { type: 'unknown-transport' },
    })

    const results = await checkMcpHealth(tmpDir)

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.name).sort()).toEqual(['broken', 'unsupported'])
  })

  it.runIf(isWindows)("fails a batch command containing '%' instead of letting cmd expand it", async () => {
    const dir = path.join(tmpDir, '100%dir')
    await fs.mkdir(dir, { recursive: true })
    const shim = path.join(dir, 'pct.cmd')
    await fs.writeFile(shim, '@echo off\r\nexit /b 0\r\n', 'utf8')
    await writeMcpJson({ pct: { command: shim, args: [] } })

    const results = await checkMcpHealth(tmpDir)

    expect(results[0].status).toBe('failed')
    expect(results[0].detail).toContain('%')
  })
})
