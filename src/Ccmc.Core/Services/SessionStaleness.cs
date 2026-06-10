namespace Ccmc.Core.Services;

/// <summary>Pure rule: a project's sessions are "stale" if the newest is old AND nothing is running.</summary>
public static class SessionStaleness
{
    public static bool IsStale(DateTime? newestUtc, DateTime nowUtc, bool isRunning, int thresholdDays)
    {
        if (newestUtc is null || isRunning) return false;
        return nowUtc - newestUtc.Value > TimeSpan.FromDays(thresholdDays);
    }
}
