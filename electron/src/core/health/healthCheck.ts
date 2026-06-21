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
