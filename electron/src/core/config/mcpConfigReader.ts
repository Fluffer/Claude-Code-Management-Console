/**
 * Pure parse logic for .mcp.json "mcpServers" maps.
 * Takes a JSON string → McpServerInfo[]. File reading is the caller's responsibility.
 *
 * Defensive: any malformed shape yields an empty list rather than throwing —
 * MCP config schema may evolve across CLI releases.
 *
 * Direct port of C# McpConfigReader (fs reads deferred to Phase 3 main-process wrapper).
 */

import type { McpServerInfo } from '../models'

/**
 * Parse a .mcp.json content string and return the list of MCP servers.
 * Pass null to represent an absent file — returns empty list.
 *
 * Transport resolution (mirrors C# logic):
 *   - If entry has a "type" string field → transport = that value
 *   - Else if entry has a "command" string field → transport = that value
 *   - Else → transport = "stdio"
 */
export function parseJson(json: string | null): McpServerInfo[] {
  if (json === null) return []
  const result: McpServerInfo[] = []
  try {
    const root: unknown = JSON.parse(json)
    if (typeof root !== 'object' || root === null || Array.isArray(root)) return result
    const servers = (root as Record<string, unknown>)['mcpServers']
    if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return result

    for (const [name, entry] of Object.entries(servers as Record<string, unknown>)) {
      let transport = 'stdio'
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        const e = entry as Record<string, unknown>
        if (typeof e['type'] === 'string') {
          transport = e['type'] as string
        } else if (typeof e['command'] === 'string') {
          transport = e['command'] as string
        }
      }
      result.push({ name, transport })
    }
  } catch {
    // malformed JSON — return empty list, never throw
  }
  return result
}

/** Returns true when the JSON contains at least one MCP server. */
export function has(json: string | null): boolean {
  return parseJson(json).length > 0
}
