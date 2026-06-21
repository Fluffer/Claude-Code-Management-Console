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
