using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class DeepLinkBuilderTests
{
    [Fact]
    public void Build_RoundTripsThroughParser()
    {
        var uri = DeepLinkBuilder.Build("Hotel-Search");
        var parsed = DeepLinkParser.Parse(uri);
        Assert.NotNull(parsed);
        Assert.Equal("launch", parsed!.Value.Action);
        Assert.Equal("Hotel-Search", parsed.Value.Project);
        Assert.False(parsed.Value.NewSession);
    }

    [Fact]
    public void Build_EncodesSpecialCharacters_RoundTrips()
    {
        var uri = DeepLinkBuilder.Build(@"C:\Dev\My App & Co");
        var parsed = DeepLinkParser.Parse(uri);
        Assert.NotNull(parsed);
        Assert.Equal(@"C:\Dev\My App & Co", parsed!.Value.Project);
    }

    [Fact]
    public void Build_NewSessionFlag_RoundTrips()
    {
        var uri = DeepLinkBuilder.Build("Foo", newSession: true);
        var parsed = DeepLinkParser.Parse(uri);
        Assert.True(parsed!.Value.NewSession);
    }
}
