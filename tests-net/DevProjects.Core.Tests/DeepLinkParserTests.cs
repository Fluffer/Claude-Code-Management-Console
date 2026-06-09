using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class DeepLinkParserTests
{
    [Fact]
    public void Parse_ExtractsProjectQuery()
    {
        var r = DeepLinkParser.Parse("dev-projects://launch?project=Hotel-Search");
        Assert.NotNull(r);
        Assert.Equal("launch", r!.Value.Action);
        Assert.Equal("Hotel-Search", r.Value.Project);
        Assert.False(r.Value.NewSession);
    }

    [Fact]
    public void Parse_DecodesEncodedPathAndNewFlag()
    {
        var r = DeepLinkParser.Parse("dev-projects://launch?project=C%3A%5CDev%5CFoo&new=true");
        Assert.NotNull(r);
        Assert.Equal(@"C:\Dev\Foo", r!.Value.Project);
        Assert.True(r.Value.NewSession);
    }

    [Theory]
    [InlineData("https://example.com")]            // wrong scheme
    [InlineData("dev-projects://launch")]          // no project
    [InlineData("not a uri")]
    [InlineData("dev-projects://?project=foo")]    // empty host / no action
    public void Parse_ReturnsNullOnInvalid(string uri) => Assert.Null(DeepLinkParser.Parse(uri));
}
