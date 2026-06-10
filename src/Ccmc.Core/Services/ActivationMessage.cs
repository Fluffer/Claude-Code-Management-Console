namespace Ccmc.Core.Services;

/// <summary>
/// Payload protocol for the single-instance activation pipe.
/// "ACTIVATE" = bring the window forward; "LINK &lt;uri&gt;" = also launch the deep link.
/// </summary>
public static class ActivationMessage
{
    public const string Activate = "ACTIVATE";
    private const string LinkPrefix = "LINK ";

    public static string FormatLink(string uri) => LinkPrefix + uri;

    /// <summary>The deep link carried by the payload, or null for plain activation / malformed input.</summary>
    public static DeepLinkParser.DeepLink? ParseLink(string? payload)
    {
        if (payload is null || !payload.StartsWith(LinkPrefix, StringComparison.Ordinal)) return null;
        return DeepLinkParser.Parse(payload[LinkPrefix.Length..]);
    }
}
