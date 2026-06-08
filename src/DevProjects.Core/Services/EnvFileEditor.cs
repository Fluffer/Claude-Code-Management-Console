namespace DevProjects.Core.Services;

/// <summary>
/// Reads and edits a .env file as KEY=VALUE lines, preserving comments, blank lines, and order.
/// Pure string operations over the file text — the UI handles read/write. Values are returned
/// verbatim (no unquoting) to avoid corrupting secrets on round-trip.
/// </summary>
public static class EnvFileEditor
{
    public readonly record struct EnvEntry(string Key, string Value);

    public static IReadOnlyList<EnvEntry> Parse(string text)
    {
        var result = new List<EnvEntry>();
        foreach (var raw in Normalize(text).Split('\n'))
        {
            var line = raw.TrimStart();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            result.Add(new EnvEntry(line[..eq].Trim(), line[(eq + 1)..]));
        }
        return result;
    }

    public static string SetKey(string text, string key, string value)
    {
        var lines = SplitKeepingTrailing(Normalize(text));
        for (var i = 0; i < lines.Count; i++)
        {
            if (IsAssignmentFor(lines[i], key)) { lines[i] = $"{key}={value}"; return string.Join('\n', lines); }
        }
        // Append before any trailing empty element so we keep a single final newline.
        var insertAt = lines.Count > 0 && lines[^1].Length == 0 ? lines.Count - 1 : lines.Count;
        lines.Insert(insertAt, $"{key}={value}");
        return string.Join('\n', lines);
    }

    public static string RemoveKey(string text, string key)
    {
        var lines = SplitKeepingTrailing(Normalize(text));
        lines.RemoveAll(l => IsAssignmentFor(l, key));
        return string.Join('\n', lines);
    }

    private static bool IsAssignmentFor(string line, string key)
    {
        var t = line.TrimStart();
        var eq = t.IndexOf('=');
        return eq > 0 && string.Equals(t[..eq].Trim(), key, StringComparison.Ordinal);
    }

    private static string Normalize(string text) => text.Replace("\r\n", "\n");

    // Preserve a trailing newline as a final empty element so round-trips don't strip it.
    private static List<string> SplitKeepingTrailing(string text) => text.Split('\n').ToList();
}
