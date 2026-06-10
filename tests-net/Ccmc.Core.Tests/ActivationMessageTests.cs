using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ActivationMessageTests
{
    [Fact]
    public void FormatLink_ParseLink_RoundTrips()
    {
        var payload = ActivationMessage.FormatLink(DeepLinkBuilder.Build("Foo", newSession: true));
        var link = ActivationMessage.ParseLink(payload);
        Assert.NotNull(link);
        Assert.Equal("Foo", link!.Value.Project);
        Assert.True(link.Value.NewSession);
    }

    [Theory]
    [InlineData("ACTIVATE")]          // plain activation carries no link
    [InlineData("LINK not a uri")]    // garbage after prefix
    [InlineData("LINK ")]             // empty link
    [InlineData("")]
    [InlineData(null)]
    public void ParseLink_ReturnsNullForNonLinkPayloads(string? payload) =>
        Assert.Null(ActivationMessage.ParseLink(payload));
}
