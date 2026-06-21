/** Outcome of a single MCP server health probe. */
export type HealthStatus = 'ok' | 'failed' | 'timeout' | 'unsupported'

/** Health result for one server, keyed by its .mcp.json name. */
export interface HealthResult {
  name: string
  status: HealthStatus
  /** Short human-readable detail (error message, HTTP status, etc.), or null. */
  detail: string | null
}
