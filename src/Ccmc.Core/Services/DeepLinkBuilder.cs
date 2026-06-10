namespace Ccmc.Core.Services;

/// <summary>Builds ccmc://launch deep links. Inverse of <see cref="DeepLinkParser"/>.</summary>
public static class DeepLinkBuilder
{
    public static string Build(string project, bool newSession = false)
    {
        var uri = $"{DeepLinkParser.Scheme}://launch?project={Uri.EscapeDataString(project)}";
        return newSession ? uri + "&new=true" : uri;
    }
}
