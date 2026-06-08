using System.Text.RegularExpressions;

namespace DevProjects.Core.Services;

/// <summary>Parses and compares claude CLI semver strings. Unknown input never nags.</summary>
public static partial class ClaudeVersionInfo
{
    [GeneratedRegex(@"(\d+)\.(\d+)\.(\d+)")]
    private static partial Regex Semver();

    public static (int Major, int Minor, int Patch)? Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var m = Semver().Match(raw);
        if (!m.Success) return null;
        return (int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
    }

    public static bool IsOutdated(string? installed, string? latest)
    {
        var a = Parse(installed);
        var b = Parse(latest);
        if (a is null || b is null) return false;
        return Compare(b.Value, a.Value) > 0;
    }

    private static int Compare((int Major, int Minor, int Patch) x, (int Major, int Minor, int Patch) y)
    {
        if (x.Major != y.Major) return x.Major.CompareTo(y.Major);
        if (x.Minor != y.Minor) return x.Minor.CompareTo(y.Minor);
        return x.Patch.CompareTo(y.Patch);
    }
}
