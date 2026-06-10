using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ShellMenuComposerTests
{
    [Fact]
    public void Compose_PinnedFirstThenRecents()
    {
        var entries = ShellMenuComposer.Compose(
            pinnedPaths: [@"C:\Dev\Pin1"],
            recentPaths: [@"C:\Dev\Rec1", @"C:\Dev\Rec2"],
            recentCap: 5);
        Assert.Equal(3, entries.Count);
        Assert.Equal("Pin1", entries[0].Label);
        Assert.True(entries[0].IsPinned);
        Assert.Equal("Rec1", entries[1].Label);
        Assert.False(entries[1].IsPinned);
    }

    [Fact]
    public void Compose_DedupesPinnedOutOfRecents_CaseInsensitive()
    {
        var entries = ShellMenuComposer.Compose(
            pinnedPaths: [@"C:\Dev\Foo"],
            recentPaths: [@"c:\dev\foo", @"C:\Dev\Bar"],
            recentCap: 5);
        Assert.Equal(2, entries.Count);
        Assert.Equal(@"C:\Dev\Foo", entries[0].Path);
        Assert.Equal("Bar", entries[1].Label);
    }

    [Fact]
    public void Compose_CapsRecents()
    {
        var recents = Enumerable.Range(1, 10).Select(i => $@"C:\Dev\R{i}");
        var entries = ShellMenuComposer.Compose([], recents, recentCap: 5);
        Assert.Equal(5, entries.Count);
        Assert.Equal("R1", entries[0].Label); // newest first preserved
    }

    [Fact]
    public void Compose_SkipsBlanksAndDuplicates_EmptyInputsYieldEmpty()
    {
        Assert.Empty(ShellMenuComposer.Compose([], [], 5));
        var entries = ShellMenuComposer.Compose(
            pinnedPaths: ["", @"C:\Dev\A", @"C:\Dev\A"],
            recentPaths: ["  "],
            recentCap: 5);
        Assert.Single(entries);
    }

    [Fact]
    public void Compose_LabelIsFolderName_TrailingSeparatorTolerated()
    {
        var entries = ShellMenuComposer.Compose([@"C:\Dev\My Project\"], [], 5);
        Assert.Equal("My Project", entries[0].Label);
    }
}
