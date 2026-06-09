using System.Text.Json;

namespace DevProjects.Core.Services;

/// <summary>
/// Validates a project's .claude/settings.json parses as JSON. An absent file is valid
/// (nothing configured); a present-but-broken file is the case worth surfacing, because
/// Claude silently ignores a malformed settings.json. Filesystem only, fail-soft.
/// </summary>
public static class SettingsJsonValidator
{
    public readonly record struct Result(bool IsValid, string? Error, string? SettingsPath);

    public static Result Validate(string projectPath)
    {
        string path;
        try { path = Path.Combine(projectPath, ".claude", "settings.json"); }
        catch (ArgumentException) { return new Result(true, null, null); }

        try
        {
            if (!File.Exists(path)) return new Result(true, null, null);
            using var _ = JsonDocument.Parse(File.ReadAllText(path));
            return new Result(true, null, path);
        }
        catch (JsonException ex)
        {
            return new Result(false, ex.Message, path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Can't read it — don't cry wolf; treat as "nothing actionable".
            return new Result(true, null, path);
        }
    }
}
