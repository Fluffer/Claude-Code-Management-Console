namespace DevProjects.Core.Services;

/// <summary>Surfaces a project's .claudeignore (presence + path). No structured editing — open-in-editor.</summary>
public static class ClaudeIgnoreInfo
{
    public static string? Path(string projectPath)
    {
        try
        {
            var p = System.IO.Path.Combine(projectPath, ".claudeignore");
            return File.Exists(p) ? p : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    public static bool Has(string projectPath) => Path(projectPath) is not null;
}
