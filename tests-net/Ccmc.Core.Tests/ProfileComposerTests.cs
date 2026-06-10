using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProfileComposerTests
{
    [Fact]
    public void Compose_ModelOnly()
    {
        var p = new LaunchProfile { Name = "Opus", Model = "opus" };
        Assert.Equal("--model opus", ProfileComposer.Compose(p));
    }

    [Fact]
    public void Compose_AllParts_InStableOrder()
    {
        var p = new LaunchProfile
        {
            Name = "Plan-safe",
            Model = "sonnet",
            PermissionMode = "plan",
            AllowedTools = ["Read", "Edit"],
            DisallowedTools = ["Bash"],
        };
        Assert.Equal(
            "--model sonnet --permission-mode plan --allowedTools Read Edit --disallowedTools Bash",
            ProfileComposer.Compose(p));
    }

    [Fact]
    public void Compose_EmptyProfile_IsEmptyString() =>
        Assert.Equal("", ProfileComposer.Compose(new LaunchProfile { Name = "Empty" }));

    [Theory]
    [InlineData("opus | rm")]          // pipe
    [InlineData("Bash(git:*)")]        // parens — the scoped-tool case we explicitly cannot express
    public void Compose_ThrowsOnUnsafeToken(string poison)
    {
        var p = new LaunchProfile { Name = "x", AllowedTools = [poison] };
        Assert.Throws<ArgumentException>(() => ProfileComposer.Compose(p));
    }

    [Fact]
    public void Compose_ResultAlwaysPassesAreFlagsSafe()
    {
        var p = new LaunchProfile { Name = "ok", Model = "haiku", PermissionMode = "acceptEdits", AllowedTools = ["Read"] };
        Assert.True(LaunchCommandBuilder.AreFlagsSafe(ProfileComposer.Compose(p)));
    }
}
