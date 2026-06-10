using System.Text.Json;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>
/// Reads the project's .mcp.json "mcpServers" map (read-only). Defensive: any malformed shape
/// yields an empty list rather than throwing — MCP config schema may evolve across CLI releases.
/// </summary>
public static class McpConfigReader
{
    public static IReadOnlyList<McpServerInfo> Read(string projectPath)
    {
        var result = new List<McpServerInfo>();
        try
        {
            var path = Path.Combine(projectPath, ".mcp.json");
            if (!File.Exists(path)) return result;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (doc.RootElement.ValueKind != JsonValueKind.Object ||
                !doc.RootElement.TryGetProperty("mcpServers", out var servers) ||
                servers.ValueKind != JsonValueKind.Object)
                return result;

            foreach (var entry in servers.EnumerateObject())
            {
                var transport = "stdio";
                if (entry.Value.ValueKind == JsonValueKind.Object)
                {
                    if (entry.Value.TryGetProperty("type", out var t) && t.ValueKind == JsonValueKind.String)
                        transport = t.GetString() ?? "stdio";
                    else if (entry.Value.TryGetProperty("command", out var c) && c.ValueKind == JsonValueKind.String)
                        transport = c.GetString() ?? "stdio";
                }
                result.Add(new McpServerInfo(entry.Name, transport));
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        return result;
    }

    public static bool Has(string projectPath) => Read(projectPath).Count > 0;
}
