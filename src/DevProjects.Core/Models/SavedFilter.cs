namespace DevProjects.Core.Models;

/// <summary>
/// A named, reusable project filter. Each condition is opt-in (null/false = "don't care").
/// All set conditions are ANDed. Stored on AppState; surfaced as a sidebar entry.
/// </summary>
public sealed class SavedFilter
{
    public string Name { get; set; } = "";
    public string? PathContains { get; set; }
    public bool RequireGit { get; set; }
    public bool RequireClaudeMd { get; set; }
    public bool RequireRunning { get; set; }
    public bool RequirePinned { get; set; }
}
