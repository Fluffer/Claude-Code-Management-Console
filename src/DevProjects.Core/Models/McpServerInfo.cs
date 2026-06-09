namespace DevProjects.Core.Models;

/// <summary>One MCP server from .mcp.json. Transport = the "type" field, or the command for stdio servers.</summary>
public sealed record McpServerInfo(string Name, string Transport);
