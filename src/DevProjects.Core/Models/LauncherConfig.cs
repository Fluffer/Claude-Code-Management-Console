namespace DevProjects.Core.Models;

/// <summary>
/// Persisted launcher configuration. Schema is backward-compatible with the
/// original PowerShell launcher's %APPDATA%\Dev-Projects\config.json
/// (camelCase keys: roots, defaultRoot, ignore, projects).
/// </summary>
public sealed class LauncherConfig
{
    public List<string>? Roots { get; set; }
    public string? DefaultRoot { get; set; }
    public List<string>? Ignore { get; set; }
    public Dictionary<string, ProjectUsage>? Projects { get; set; }

    public static LauncherConfig CreateDefault() => new()
    {
        // A fresh install ships no personal source roots. The first-run prompt
        // (reusing AppState.OnboardingDismissed) guides a new user to add their own.
        Roots = [],
        DefaultRoot = null,
        Ignore = [],
        Projects = new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase),
    };
}

/// <summary>Per-project usage data stored in config.json.</summary>
public sealed class ProjectUsage
{
    /// <summary>ISO-8601 round-trip ("o") UTC timestamp, or null if never launched.</summary>
    public string? LastUsed { get; set; }

    public string? Flags { get; set; }
}
