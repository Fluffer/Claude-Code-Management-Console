using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

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
            "-w 0 new-tab --title \"My Proj\" -d \"C:\\Dev\\Active\\My Proj\" pwsh -NoExit -Command \"claude -n 'My Proj' --model opus\"",
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
        Assert.Equal("-NoExit -Command \"claude -n 'Proj' --continue\"", spec.Arguments);
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

    [Fact]
    public void BuildClaudeCommand_WithPrompt_SingleQuotesForPowerShell()
    {
        var cmd = LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false, initialPrompt: "fix the $bug & ship");
        Assert.Equal("claude 'fix the $bug & ship'", cmd);
    }

    [Fact]
    public void BuildClaudeCommand_WithPrompt_DoublesSingleQuotes()
    {
        var cmd = LaunchCommandBuilder.BuildClaudeCommand("--model opus", continueSession: false, initialPrompt: "it's broken");
        Assert.Equal("claude 'it''s broken' --model opus", cmd);
    }

    [Fact]
    public void BuildClaudeCommand_PromptIgnoredWhenContinue()
    {
        var cmd = LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true, initialPrompt: "hi");
        Assert.Equal("claude --continue", cmd);
    }

    // Security regression guard: a prompt that tries to break out of the single-quoted
    // string must stay fully quoted (every ' doubled). If this ever fails, command
    // injection into the spawned PowerShell tab has reopened.
    [Theory]
    [InlineData("'; Invoke-Expression 'whoami'", "claude '''; Invoke-Expression ''whoami'''")]
    [InlineData("'", "claude ''''")]
    public void BuildClaudeCommand_PromptInjectionProbe_StaysSingleQuoted(string prompt, string expected) =>
        Assert.Equal(expected, LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false, initialPrompt: prompt));

    [Fact]
    public void BuildClaudeCommand_NullFlags_Throws() =>
        Assert.Throws<ArgumentNullException>(() =>
            LaunchCommandBuilder.BuildClaudeCommand(null!, continueSession: false));

    [Fact]
    public void BuildClaudeCommand_WithName_PrependsSingleQuotedName() =>
        Assert.Equal("claude -n 'Foo Bar' --continue",
            LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true, name: "Foo Bar"));

    [Fact]
    public void BuildClaudeCommand_NameWithApostrophe_DoublesIt() =>
        Assert.Equal("claude -n 'O''Brien'",
            LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false, name: "O'Brien"));

    [Fact]
    public void BuildClaudeCommand_NameWithShellChars_StaysQuoted_AndFlagsUnaffected()
    {
        var cmd = LaunchCommandBuilder.BuildClaudeCommand(
            "--model opus", continueSession: false, name: "A & B (test)");
        Assert.Equal("claude -n 'A & B (test)' --model opus", cmd);
        Assert.True(LaunchCommandBuilder.AreFlagsSafe("--model opus"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void BuildClaudeCommand_EmptyName_OmitsNameArgument(string? name) =>
        Assert.Equal("claude --continue",
            LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true, name: name));

    // Security regression guard for the -n session name: a name that tries to break out of the
    // single-quoted string must stay fully quoted (every ' doubled). Mirrors the initialPrompt probe.
    [Theory]
    [InlineData("'; Invoke-Expression 'whoami'", "claude -n '''; Invoke-Expression ''whoami'''")]
    [InlineData("`whoami`", "claude -n '`whoami`'")]
    [InlineData("$env:SECRET", "claude -n '$env:SECRET'")]
    public void BuildClaudeCommand_NameInjectionProbe_StaysSingleQuoted(string name, string expected) =>
        Assert.Equal(expected, LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false, name: name));

    [Fact]
    public void BuildClaudeCommand_NameAndPrompt_NameComesFirst() =>
        Assert.Equal("claude -n 'Proj' 'do a thing' --model opus",
            LaunchCommandBuilder.BuildClaudeCommand(
                "--model opus", continueSession: false, initialPrompt: "do a thing", name: "Proj"));

    [Fact]
    public void Build_WithWindowsTerminal_ThreadsNameIntoClaude_AndKeepsWtTitle()
    {
        var spec = LaunchCommandBuilder.Build(
            "My Proj", @"C:\Dev\Active\My Proj", "--model opus",
            continueSession: false, shell: "pwsh", wtPath: @"C:\wt\wt.exe");

        Assert.Contains("--title \"My Proj\"", spec.Arguments);
        Assert.Contains("\"claude -n 'My Proj' --model opus\"", spec.Arguments);
    }
}
