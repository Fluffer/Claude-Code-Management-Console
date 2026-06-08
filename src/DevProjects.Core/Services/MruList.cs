namespace DevProjects.Core.Services;

/// <summary>Pure most-recently-used list ops: dedup (case-insensitive), move-to-front, cap.</summary>
public static class MruList
{
    public static List<string> Add(IEnumerable<string> existing, string item, int cap)
    {
        var result = new List<string> { item };
        foreach (var e in existing)
            if (!string.Equals(e, item, StringComparison.OrdinalIgnoreCase))
                result.Add(e);
        return result.Count > cap ? result.GetRange(0, cap) : result;
    }
}
