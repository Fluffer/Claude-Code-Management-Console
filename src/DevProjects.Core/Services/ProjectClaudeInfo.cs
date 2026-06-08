namespace DevProjects.Core.Services;

/// <summary>Surfaces a project's CLAUDE.md (the strongest "Claude-ready" signal).</summary>
public static class ProjectClaudeInfo
{
    public static string? ClaudeMdPath(string projectPath)
    {
        try
        {
            var p = Path.Combine(projectPath, "CLAUDE.md");
            return File.Exists(p) ? p : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    public static bool HasClaudeMd(string projectPath) => ClaudeMdPath(projectPath) is not null;
}
