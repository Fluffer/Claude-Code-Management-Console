namespace DevProjects.Core.Services;

/// <summary>Pure diff of running-session directory snapshots: which projects just ended.</summary>
public static class SessionEndDetector
{
    public static IEnumerable<string> Ended(IReadOnlySet<string> previous, IReadOnlySet<string> current) =>
        previous.Where(p => !current.Contains(p));
}
