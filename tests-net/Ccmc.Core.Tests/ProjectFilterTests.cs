using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProjectFilterTests
{
    private static ProjectFacts Facts(string path = @"C:\Dev\Active\Foo",
        bool git = true, bool claudeMd = true, bool running = false, bool pinned = false) =>
        new(path, git, claudeMd, running, pinned);

    [Fact]
    public void EmptyFilter_MatchesEverything() =>
        Assert.True(ProjectFilter.Matches(new SavedFilter { Name = "all" }, Facts()));

    [Fact]
    public void PathContains_CaseInsensitive()
    {
        var f = new SavedFilter { Name = "active", PathContains = "active" };
        Assert.True(ProjectFilter.Matches(f, Facts(path: @"C:\Dev\Active\Foo")));
        Assert.False(ProjectFilter.Matches(f, Facts(path: @"C:\Dev\Archive\Bar")));
    }

    [Fact]
    public void RequireGit_FiltersNonGit()
    {
        var f = new SavedFilter { Name = "git", RequireGit = true };
        Assert.True(ProjectFilter.Matches(f, Facts(git: true)));
        Assert.False(ProjectFilter.Matches(f, Facts(git: false)));
    }

    [Fact]
    public void Conditions_AreAnded()
    {
        var f = new SavedFilter { Name = "ready", RequireClaudeMd = true, RequireRunning = true };
        Assert.True(ProjectFilter.Matches(f, Facts(claudeMd: true, running: true)));
        Assert.False(ProjectFilter.Matches(f, Facts(claudeMd: true, running: false)));
        Assert.False(ProjectFilter.Matches(f, Facts(claudeMd: false, running: true)));
    }

    [Fact]
    public void RequireClaudeMd_FiltersWithout()
    {
        var f = new SavedFilter { Name = "md", RequireClaudeMd = true };
        Assert.True(ProjectFilter.Matches(f, Facts(claudeMd: true)));
        Assert.False(ProjectFilter.Matches(f, Facts(claudeMd: false)));
    }

    [Fact]
    public void RequirePinned_FiltersUnpinned()
    {
        var f = new SavedFilter { Name = "pins", RequirePinned = true };
        Assert.True(ProjectFilter.Matches(f, Facts(pinned: true)));
        Assert.False(ProjectFilter.Matches(f, Facts(pinned: false)));
    }
}
