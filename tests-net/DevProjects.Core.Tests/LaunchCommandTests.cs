using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class ArgumentEscaperTests
{
    [Theory]
    [InlineData("plain", "plain")]
    [InlineData("has space", "\"has space\"")]
    [InlineData("", "\"\"")]
    public void Quote_BasicCases(string input, string expected) =>
        Assert.Equal(expected, ArgumentEscaper.Quote(input));

    [Fact]
    public void Quote_EscapesEmbeddedQuotes()
    {
        // say "hi"  ->  "say \"hi\""
        Assert.Equal("\"say \\\"hi\\\"\"", ArgumentEscaper.Quote("say \"hi\""));
    }

    [Fact]
    public void Quote_DoublesBackslashRunBeforeQuote()
    {
        // path\"  ->  "path\\\"" (backslash doubled, quote escaped)
        Assert.Equal("\"path\\\\\\\"\"", ArgumentEscaper.Quote("path\\\""));
    }

    [Fact]
    public void Quote_DoublesTrailingBackslashes_InQuotedToken()
    {
        // C:\My Dir\  ->  "C:\My Dir\\"
        Assert.Equal("\"C:\\My Dir\\\\\"", ArgumentEscaper.Quote("C:\\My Dir\\"));
    }

    [Fact]
    public void Quote_LeavesPathWithoutSpacesUnquoted()
    {
        Assert.Equal(@"C:\Dev\Active\Foo", ArgumentEscaper.Quote(@"C:\Dev\Active\Foo"));
    }

    [Fact]
    public void Join_CombinesQuotedArguments()
    {
        Assert.Equal("a \"b c\" d", ArgumentEscaper.Join(["a", "b c", "d"]));
    }
}

public class LaunchCommandBuilderTests
{
    [Fact]
    public void ClaudeCommand_PlainNew() =>
        Assert.Equal("claude", LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false));

    [Fact]
    public void ClaudeCommand_Continue() =>
        Assert.Equal("claude --continue", LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true));

    [Fact]
    public void ClaudeCommand_ContinueWithFlags() =>
        Assert.Equal("claude --continue --model opus",
            LaunchCommandBuilder.BuildClaudeCommand("  --model opus  ", continueSession: true));

    [Fact]
    public void Build_WithWindowsTerminal_BuildsWtNewTabInvocation()
    {
        var spec = LaunchCommandBuilder.Build(
            "My Proj", @"C:\Dev\Active\My Proj", "--model opus",
            continueSession: false, shell: "pwsh", wtPath: @"C:\wt\wt.exe");

        Assert.Equal(@"C:\wt\wt.exe", spec.FilePath);
        Assert.Null(spec.WorkingDirectory);
        Assert.Equal(
            "-w 0 new-tab --title \"My Proj\" -d \"C:\\Dev\\Active\\My Proj\" pwsh -NoExit -Command \"claude --model opus\"",
            spec.Arguments);
    }

    [Fact]
    public void Build_WithoutWindowsTerminal_FallsBackToShell()
    {
        var spec = LaunchCommandBuilder.Build(
            "Proj", @"C:\Dev\Proj", "", continueSession: true,
            shell: "powershell", wtPath: null, probeWindowsTerminal: false);

        Assert.Equal("powershell", spec.FilePath);
        Assert.Equal(@"C:\Dev\Proj", spec.WorkingDirectory);
        Assert.Equal("-NoExit -Command \"claude --continue\"", spec.Arguments);
    }

    [Theory]
    [InlineData("--model opus; Remove-Item C:\\x")]
    [InlineData("--verbose | out-file x")]
    [InlineData("--model $env:SECRET")]
    [InlineData("--add-dir `whoami`")]
    [InlineData("a && b")]
    public void BuildClaudeCommand_RejectsShellMetacharacters(string flags)
    {
        Assert.False(LaunchCommandBuilder.AreFlagsSafe(flags));
        Assert.Throws<ArgumentException>(() =>
            LaunchCommandBuilder.BuildClaudeCommand(flags, continueSession: false));
    }

    [Theory]
    [InlineData("")]
    [InlineData("--model opus")]
    [InlineData("--add-dir \"C:\\Other Dir\"")]
    [InlineData("--permission-mode plan --verbose")]
    public void AreFlagsSafe_AcceptsNormalFlags(string flags) =>
        Assert.True(LaunchCommandBuilder.AreFlagsSafe(flags));

    [Fact]
    public void Build_FlagsWithQuotes_AreEscapedCorrectly()
    {
        var spec = LaunchCommandBuilder.Build(
            "P", @"C:\P", "--add-dir \"C:\\Other Dir\"",
            continueSession: false, shell: "pwsh", wtPath: @"C:\wt\wt.exe");

        Assert.Contains("\\\"C:\\Other Dir\\\"", spec.Arguments);
    }
}
