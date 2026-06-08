namespace DevProjects.Core.Services;

/// <summary>Case-insensitive subsequence fuzzy match with a simple ranking score.</summary>
public static class FuzzyMatcher
{
    /// <summary>Higher is better. Null = query is not a subsequence of candidate. Empty query = 0.</summary>
    public static int? Score(string query, string candidate)
    {
        if (string.IsNullOrEmpty(query)) return 0;
        if (string.IsNullOrEmpty(candidate)) return null;

        int qi = 0, score = 0, streak = 0;
        for (int ci = 0; ci < candidate.Length && qi < query.Length; ci++)
        {
            if (char.ToLowerInvariant(candidate[ci]) == char.ToLowerInvariant(query[qi]))
            {
                score += 1 + streak * 4;
                if (ci == 0 || !char.IsLetterOrDigit(candidate[ci - 1]))
                    score += 5;
                streak++;
                qi++;
            }
            else streak = 0;
        }
        return qi == query.Length ? score : null;
    }

    public static IEnumerable<T> Rank<T>(string query, IEnumerable<T> items, Func<T, string> selector)
    {
        return items
            .Select(i => (Item: i, Score: Score(query, selector(i))))
            .Where(x => x.Score is not null)
            .OrderByDescending(x => x.Score!.Value)
            .ThenBy(x => selector(x.Item), StringComparer.OrdinalIgnoreCase)
            .Select(x => x.Item);
    }
}
