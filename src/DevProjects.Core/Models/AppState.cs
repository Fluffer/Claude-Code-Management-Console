namespace DevProjects.Core.Models;

/// <summary>
/// New UI state introduced by the .NET rewrite. Stored in a separate
/// %APPDATA%\Dev-Projects\state.json so config.json keeps its original
/// schema and stays compatible with the PowerShell launcher.
/// </summary>
public sealed class AppState
{
    /// <summary>"System", "Light" or "Dark".</summary>
    public string Theme { get; set; } = "System";

    /// <summary>"LastUsed" or "Name".</summary>
    public string SortMode { get; set; } = "LastUsed";

    /// <summary>Full paths of pinned projects (shown first in the list).</summary>
    public List<string> Pinned { get; set; } = [];

    public bool OnboardingDismissed { get; set; }
}
