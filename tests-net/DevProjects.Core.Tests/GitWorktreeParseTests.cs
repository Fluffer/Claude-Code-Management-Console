using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class GitWorktreeParseTests
{
    [Fact]
    public void Parse_TwoWorktrees_MainAndFeature()
    {
        // Real `git worktree list --porcelain` output: blank-line-separated stanzas.
        var output =
            "worktree C:/Dev/Active/Foo\nHEAD abc123\nbranch refs/heads/main\n" +
            "\n" +
            "worktree C:/Dev/Active/Foo-feat\nHEAD def456\nbranch refs/heads/feature/x\n";

        var list = GitWorktreeProvider.Parse(output);

        Assert.Equal(2, list.Count);
        Assert.Equal(@"C:/Dev/Active/Foo", list[0].Path);
        Assert.Equal("main", list[0].Branch);
        Assert.False(list[0].IsDetached);
        Assert.Equal("feature/x", list[1].Branch);
    }

    [Fact]
    public void Parse_DetachedAndBare()
    {
        var output =
            "worktree C:/Dev/Bare\nbare\n" +
            "\n" +
            "worktree C:/Dev/Detached\nHEAD aaa111\ndetached\n";

        var list = GitWorktreeProvider.Parse(output);

        Assert.Equal(2, list.Count);
        Assert.True(list[0].IsBare);
        Assert.True(list[1].IsDetached);
        Assert.Null(list[1].Branch);
    }

    [Fact]
    public void Parse_EmptyOutput_IsEmpty() => Assert.Empty(GitWorktreeProvider.Parse(""));
}
