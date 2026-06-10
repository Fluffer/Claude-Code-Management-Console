using System.Web;

namespace Ccmc.Core.Services;

/// <summary>Parses ccmc://launch?project=&lt;name-or-path&gt;[&amp;new=true]. Returns null on anything invalid.</summary>
public static class DeepLinkParser
{
    public readonly record struct DeepLink(string Action, string Project, bool NewSession);

    public const string Scheme = "ccmc";

    public static DeepLink? Parse(string? uriString)
    {
        if (string.IsNullOrWhiteSpace(uriString)) return null;
        if (!Uri.TryCreate(uriString, UriKind.Absolute, out var uri)) return null;
        if (!string.Equals(uri.Scheme, Scheme, StringComparison.OrdinalIgnoreCase)) return null;

        var action = uri.Host; // "launch"
        if (string.IsNullOrEmpty(action)) return null;

        var query = HttpUtility.ParseQueryString(uri.Query);
        var project = query["project"];
        if (string.IsNullOrWhiteSpace(project)) return null;

        var newSession = string.Equals(query["new"], "true", StringComparison.OrdinalIgnoreCase);
        return new DeepLink(action, project, newSession);
    }
}
