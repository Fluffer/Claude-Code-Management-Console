import * as path from 'node:path'
import type { McpServerInfo } from '../../core/models'
import { parseJson } from '../../core/config/mcpConfigReader'
import { readFileUtf8 } from '../os/atomicFile'

/**
 * The .mcp.json filename used by Claude CLI, matching C# McpConfigReader.
 */
const MCP_FILENAME = '.mcp.json'

/**
 * Reads the `.mcp.json` file at `<projectPath>/.mcp.json` and returns the
 * list of MCP servers parsed by core `parseJson`.
 * Returns an empty array if the file is absent or contains no servers.
 */
export async function readMcp(projectPath: string): Promise<McpServerInfo[]> {
  const mcpPath = path.join(projectPath, MCP_FILENAME)
  const contents = await readFileUtf8(mcpPath)
  return parseJson(contents)
}
