using System.Text.Json.Nodes;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ClaudeTrustTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-trust-").FullName;
    private string ClaudeJson => Path.Combine(_dir, ".claude.json");

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    private JsonNode ReadBack() => JsonNode.Parse(File.ReadAllText(ClaudeJson))!;

    [Fact]
    public void NoOp_WhenClaudeJsonMissing()
    {
        // Claude Code has never run for this user — its config file is not ours to create.
        Assert.False(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));
        Assert.False(File.Exists(ClaudeJson));
    }

    [Fact]
    public void AddsProjectsSection_AndEntry_PreservingOtherTopLevelKeys()
    {
        File.WriteAllText(ClaudeJson, """{"oauthAccount":{"email":"x@y.z"},"numStartups":42}""");
        Assert.True(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));

        var root = ReadBack();
        Assert.True((bool)root["projects"]![@"C:\Dev\Proj"]!["hasTrustDialogAccepted"]!);
        Assert.Equal("x@y.z", (string)root["oauthAccount"]!["email"]!);
        Assert.Equal(42, (int)root["numStartups"]!);
    }

    [Fact]
    public void AddsEntry_WhenProjectsExistsButPathAbsent()
    {
        File.WriteAllText(ClaudeJson,
            """{"projects":{"C:\\Other":{"hasTrustDialogAccepted":true,"allowedTools":["Bash"]}}}""");
        Assert.True(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));

        var projects = ReadBack()["projects"]!;
        Assert.True((bool)projects[@"C:\Dev\Proj"]!["hasTrustDialogAccepted"]!);
        // Existing entry untouched.
        Assert.Equal("Bash", (string)projects[@"C:\Other"]!["allowedTools"]![0]!);
    }

    [Fact]
    public void FlipsFalseToTrue_PreservingSiblingProperties()
    {
        File.WriteAllText(ClaudeJson,
            """{"projects":{"C:\\Dev\\Proj":{"hasTrustDialogAccepted":false,"history":["old"]}}}""");
        Assert.True(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));

        var entry = ReadBack()["projects"]![@"C:\Dev\Proj"]!;
        Assert.True((bool)entry["hasTrustDialogAccepted"]!);
        Assert.Equal("old", (string)entry["history"]![0]!);
    }

    [Fact]
    public void DoesNotRewriteFile_WhenAlreadyTrusted()
    {
        // Minimise write races with live Claude Code sessions that own this file.
        var original = """{"projects":{"C:\\Dev\\Proj":{"hasTrustDialogAccepted":true}}}""";
        File.WriteAllText(ClaudeJson, original);
        Assert.True(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));
        Assert.Equal(original, File.ReadAllText(ClaudeJson));
    }

    [Fact]
    public void MatchesExistingKey_CaseInsensitively_WithoutDuplicating()
    {
        File.WriteAllText(ClaudeJson,
            """{"projects":{"c:\\dev\\proj":{"hasTrustDialogAccepted":false}}}""");
        Assert.True(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));

        var projects = ReadBack()["projects"]!.AsObject();
        Assert.Single(projects);
        Assert.True((bool)projects[@"c:\dev\proj"]!["hasTrustDialogAccepted"]!);
    }

    [Fact]
    public void TrimsTrailingSeparator_FromProjectPath()
    {
        File.WriteAllText(ClaudeJson, """{"projects":{}}""");
        Assert.True(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj\", ClaudeJson));
        Assert.True((bool)ReadBack()["projects"]![@"C:\Dev\Proj"]!["hasTrustDialogAccepted"]!);
    }

    [Fact]
    public void NoOp_OnCorruptJson_FileLeftUntouched()
    {
        // The file holds OAuth tokens and history — never quarantine or overwrite it.
        File.WriteAllText(ClaudeJson, "{ not json");
        Assert.False(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));
        Assert.Equal("{ not json", File.ReadAllText(ClaudeJson));
    }

    [Fact]
    public void NoOp_WhenRootIsNotAnObject()
    {
        File.WriteAllText(ClaudeJson, "[1,2,3]");
        Assert.False(ClaudeTrust.EnsureTrusted(@"C:\Dev\Proj", ClaudeJson));
        Assert.Equal("[1,2,3]", File.ReadAllText(ClaudeJson));
    }

    [Fact]
    public void NoOp_OnBlankProjectPath()
    {
        File.WriteAllText(ClaudeJson, """{"projects":{}}""");
        Assert.False(ClaudeTrust.EnsureTrusted("   ", ClaudeJson));
        Assert.Equal("""{"projects":{}}""", File.ReadAllText(ClaudeJson));
    }
}
