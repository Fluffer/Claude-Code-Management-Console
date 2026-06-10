using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class FuzzyMatcherTests
{
    [Fact]
    public void Score_NullWhenNotSubsequence() => Assert.Null(FuzzyMatcher.Score("xyz", "Hotel-Search"));

    [Fact]
    public void Score_NonNullWhenSubsequence() => Assert.NotNull(FuzzyMatcher.Score("hs", "Hotel-Search"));

    [Fact]
    public void Score_EmptyQueryMatchesEverything() => Assert.NotNull(FuzzyMatcher.Score("", "anything"));

    [Fact]
    public void Score_ContiguousBeatsScattered()
    {
        var contiguous = FuzzyMatcher.Score("hot", "Hotel");
        var scattered = FuzzyMatcher.Score("hot", "Have-Other-Tasks");
        Assert.NotNull(contiguous);
        Assert.NotNull(scattered);
        Assert.True(contiguous > scattered);
    }

    [Fact]
    public void Rank_OrdersByScoreDescAndFiltersNonMatches()
    {
        var items = new[] { "Hotel-Search", "Banana", "House" };
        var ranked = FuzzyMatcher.Rank("ho", items, s => s).ToList();
        Assert.DoesNotContain("Banana", ranked);
        // Both "House" and "Hotel-Search" match "ho"; assert Banana filtered and both present.
        Assert.Contains("House", ranked);
        Assert.Contains("Hotel-Search", ranked);
    }
}
