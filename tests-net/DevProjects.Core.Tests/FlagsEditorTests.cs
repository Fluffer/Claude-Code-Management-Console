using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class FlagsEditorTests
{
    [Theory]
    [InlineData("", "opus", "--model opus")]
    [InlineData("--verbose", "opus", "--verbose --model opus")]
    [InlineData("--model sonnet", "opus", "--model opus")]
    [InlineData("--model sonnet --verbose", "opus", "--verbose --model opus")]
    [InlineData("--model sonnet", null, "")]
    [InlineData("--verbose --model opus", null, "--verbose")]
    public void SetModel(string flags, string? model, string expected) =>
        Assert.Equal(expected, FlagsEditor.SetModel(flags, model));

    [Fact]
    public void CurrentModel_ReadsBackWhatWasSet() =>
        Assert.Equal("opus", FlagsEditor.CurrentModel("--verbose --model opus"));

    [Fact]
    public void CurrentModel_NullWhenAbsent() =>
        Assert.Null(FlagsEditor.CurrentModel("--verbose"));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void CurrentModel_NullOrEmpty_ReturnsNull(string? flags) =>
        Assert.Null(FlagsEditor.CurrentModel(flags));
}
