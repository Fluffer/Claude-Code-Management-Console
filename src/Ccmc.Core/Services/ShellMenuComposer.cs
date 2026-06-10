namespace Ccmc.Core.Services;

/// <summary>One entry in the tray menu / jump list. Label is the folder name.</summary>
public sealed record ShellMenuEntry(string Label, string Path, bool IsPinned);

/// <summary>
/// Single source of truth for the tray menu and the taskbar jump list:
/// pinned projects first (config order), then recents (newest first) minus
/// anything already pinned, capped at <c>recentCap</c>.
/// </summary>
public static class ShellMenuComposer
{
    public static IReadOnlyList<ShellMenuEntry> Compose(
        IEnumerable<string> pinnedPaths, IEnumerable<string> recentPaths, int recentCap)
    {
        var entries = new List<ShellMenuEntry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var p in pinnedPaths)
        {
            if (string.IsNullOrWhiteSpace(p) || !seen.Add(p)) continue;
            entries.Add(new ShellMenuEntry(LabelOf(p), p, IsPinned: true));
        }

        var recents = 0;
        foreach (var p in recentPaths)
        {
            if (recents >= recentCap) break;
            if (string.IsNullOrWhiteSpace(p) || !seen.Add(p)) continue;
            entries.Add(new ShellMenuEntry(LabelOf(p), p, IsPinned: false));
            recents++;
        }
        return entries;
    }

    private static string LabelOf(string path) =>
        System.IO.Path.GetFileName(System.IO.Path.TrimEndingDirectorySeparator(path));
}
