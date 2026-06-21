/**
 * Outcome of a single MCP server health probe.
 * NOTE: 'timeout' is reserved — no current probe emits it. A stdio server that
 * survives the probe window is 'ok'; an http timeout maps to 'failed' (detail
 * "timed out"). Do not branch UI on 'timeout' until a probe actually produces it.
 */
export type HealthStatus = 'ok' | 'failed' | 'timeout' | 'unsupported'

/** Health result for one server, keyed by its .mcp.json name. */
export interface HealthResult {
  name: string
  status: HealthStatus
  /** Short human-readable detail (error message, HTTP status, etc.), or null. */
  detail: string | null
}
