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
