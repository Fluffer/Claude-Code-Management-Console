namespace DevProjects.Core.Models;

/// <summary>
/// New UI state introduced by the .NET rewrite. Stored in a separate
/// %APPDATA%\Dev-Projects\state.json so config.json keeps its original
/// schema and stays compatible with the PowerShell launcher.
/// </summary>
public sealed class AppState
{
    /// <summary>"System", "Light", "Dark", or a palette name (e.g. "Dracula", "Nord").</summary>
    public string Theme { get; set; } = "System";

    /// <summary>"LastUsed" or "Name".</summary>
    public string SortMode { get; set; } = "LastUsed";

    /// <summary>Full paths of pinned projects (shown first in the list).</summary>
    public List<string> Pinned { get; set; } = [];

    public bool OnboardingDismissed { get; set; }

    /// <summary>Accent color name ("Default" follows the system accent).</summary>
    public string Accent { get; set; } = "Default";

    /// <summary>UI font family name.</summary>
    public string Font { get; set; } = "Segoe UI Variable";

    /// <summary>Most-recently-launched project paths, newest first. Capped on write.</summary>
    public List<string> RecentLaunches { get; set; } = [];
}
