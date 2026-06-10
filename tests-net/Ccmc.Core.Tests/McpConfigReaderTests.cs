using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class McpConfigReaderTests : IDisposable
{
    private readonly string _proj = Directory.CreateTempSubdirectory("devprojects-mcp-").FullName;
    public void Dispose() => Directory.Delete(_proj, recursive: true);

    private void WriteMcp(string json) => File.WriteAllText(Path.Combine(_proj, ".mcp.json"), json);

    [Fact]
    public void Read_ListsServersWithTransport()
    {
        WriteMcp("""
        {
          "mcpServers": {
            "git": { "command": "uvx", "args": ["mcp-server-git"] },
            "remote": { "type": "http", "url": "https://example.com/mcp" }
          }
        }
        """);
        var servers = McpConfigReader.Read(_proj);
        Assert.Equal(2, servers.Count);
        Assert.Contains(servers, s => s.Name == "git" && s.Transport == "uvx");      // command-based
        Assert.Contains(servers, s => s.Name == "remote" && s.Transport == "http");  // type-based
    }

    [Fact]
    public void Read_AbsentFile_IsEmpty() => Assert.Empty(McpConfigReader.Read(_proj));

    [Fact]
    public void Read_GarbageJson_IsEmptyNeverThrows()
    {
        WriteMcp("{ not valid");
        Assert.Empty(McpConfigReader.Read(_proj));
    }

    [Fact]
    public void Read_NoMcpServersKey_IsEmpty()
    {
        WriteMcp("""{ "somethingElse": 1 }""");
        Assert.Empty(McpConfigReader.Read(_proj));
    }
}
