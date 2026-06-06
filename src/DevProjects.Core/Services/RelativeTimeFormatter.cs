namespace DevProjects.Core.Services;

/// <summary>"just now" / "5m ago" / "3h ago" / "2d ago" / "2026-05-28".</summary>
public static class RelativeTimeFormatter
{
    public static string Format(DateTime? timestampUtc, DateTime? nowUtc = null)
    {
        if (timestampUtc is null) return "";
        var now = nowUtc ?? DateTime.UtcNow;
        var span = now - timestampUtc.Value.ToUniversalTime();
        if (span.TotalMinutes < 1) return "just now";
        if (span.TotalHours < 1) return $"{(int)Math.Floor(span.TotalMinutes)}m ago";
        if (span.TotalDays < 1) return $"{(int)Math.Floor(span.TotalHours)}h ago";
        if (span.TotalDays < 7) return $"{(int)Math.Floor(span.TotalDays)}d ago";
        return timestampUtc.Value.ToLocalTime().ToString("yyyy-MM-dd");
    }
}
