namespace DevProjects.Core.Models;

/// <summary>
/// A named, reusable bundle of launcher flags (the Tier-2 generalization of the per-row
/// model picker). Stored launcher-side in AppState — applying a profile writes its composed
/// flags into a project's saved flags; it never mutates the project's real .claude/settings.json.
/// Tool lists are PLAIN tokens only (Read, Edit, Bash); scoped specs like Bash(git:*) are not
/// expressible because launcher flags forbid '(' / ')' (see ProfileComposer / AreFlagsSafe).
/// </summary>
public sealed class LaunchProfile
{
    public string Name { get; set; } = "";
    public string? Model { get; set; }
    public string? PermissionMode { get; set; }
    public List<string> AllowedTools { get; set; } = [];
    public List<string> DisallowedTools { get; set; } = [];
}
