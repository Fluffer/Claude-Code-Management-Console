// source: McpServerInfo.cs — in-memory only; camelCase is idiomatic TS
/** One MCP server from .mcp.json. Transport = the "type" field, or the command for stdio servers. */
export interface McpServerInfo {
  name: string;
  transport: string;
}
