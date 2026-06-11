using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProjectSearchTests
{
    private static ProjectInfo Make(string name, string description) =>
        new(name, @"C:\Dev", @"C:\Dev\" + name, null, "", description);

    [Fact]
    public void MatchesName_CaseInsensitive() =>
        Assert.True(ProjectSearch.Matches(Make("MyApi", ""), "myapi"));

    [Fact]
    public void MatchesDescription_CaseInsensitive() =>
        Assert.True(ProjectSearch.Matches(Make("MyApi", "REST backend for invoices"), "INVOICE"));

    [Fact]
    public void NoMatch_ReturnsFalse() =>
        Assert.False(ProjectSearch.Matches(Make("MyApi", "REST backend"), "frontend"));

    [Fact]
    public void EmptyDescription_StillMatchesName() =>
        Assert.True(ProjectSearch.Matches(Make("ToolBox", ""), "tool"));
}
