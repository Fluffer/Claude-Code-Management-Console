using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ClaudeVersionInfoTests
{
    [Theory]
    [InlineData("2.1.0 (Claude Code)", 2, 1, 0)]
    [InlineData("v2.10.3", 2, 10, 3)]
    [InlineData("1.0.45", 1, 0, 45)]
    public void Parse_ExtractsSemver(string raw, int maj, int min, int pat)
    {
        var v = ClaudeVersionInfo.Parse(raw);
        Assert.NotNull(v);
        Assert.Equal((maj, min, pat), (v!.Value.Major, v.Value.Minor, v.Value.Patch));
    }

    [Theory]
    [InlineData("not a version")]
    [InlineData("")]
    public void Parse_ReturnsNullOnGarbage(string raw) => Assert.Null(ClaudeVersionInfo.Parse(raw));

    [Theory]
    [InlineData("2.1.0", "2.1.1", true)]
    [InlineData("2.1.0", "2.2.0", true)]
    [InlineData("2.1.0", "3.0.0", true)]
    [InlineData("2.1.0", "2.1.0", false)]
    [InlineData("2.1.5", "2.1.0", false)]
    [InlineData("garbage", "2.1.0", false)]
    [InlineData("2.1.0", "garbage", false)]
    [InlineData(null, "2.1.0", false)]
    public void IsOutdated_ComparesCases(string? installed, string? latest, bool expected) =>
        Assert.Equal(expected, ClaudeVersionInfo.IsOutdated(installed, latest));
}
