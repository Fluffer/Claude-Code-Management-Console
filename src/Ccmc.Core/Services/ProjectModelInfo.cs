using System.Text.Json;

namespace Ccmc.Core.Services;

/// <summary>
/// Resolves the effective default Claude model configured for a project, reading the
/// "model" field of <c>&lt;project&gt;\.claude\settings.json</c> first, then the user's
/// <c>~\.claude\settings.json</c>. Returns null when no model is configured anywhere —
/// the caller then shows "Default" (Claude's built-in choice). Filesystem only, fail-soft.
/// </summary>
public static class ProjectModelInfo
{
    /// <param name="userSettingsPath">Override for the user settings.json path (tests); defaults to %USERPROFILE%\.claude\settings.json.</param>
    public static string? ResolveDefaultModel(string projectPath, string? userSettingsPath = null)
    {
        var projectModel = ReadModel(Path.Combine(projectPath, ".claude", "settings.json"));
        if (projectModel is not null) return projectModel;

        userSettingsPath ??= Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "settings.json");
        return ReadModel(userSettingsPath);
    }

    private static string? ReadModel(string settingsPath)
    {
        try
        {
            if (!File.Exists(settingsPath)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(settingsPath));
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("model", out var m) &&
                m.ValueKind == JsonValueKind.String)
            {
                var value = m.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        return null;
    }
}
