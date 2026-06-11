using System.Text.Json;
using System.Text.Json.Nodes;

namespace Ccmc.Core.Services;

/// <summary>
/// Pre-accepts Claude Code's folder-trust dialog for a project by setting
/// <c>projects.&lt;path&gt;.hasTrustDialogAccepted = true</c> in <c>~\.claude.json</c>.
/// That file is owned by Claude Code and also holds OAuth tokens and history, so this
/// is a surgical merge: parse, mutate the one flag, write atomically — and bail out
/// (no-op) on a missing or unparseable file rather than ever creating or clobbering it.
/// Skipping the write when the project is already trusted minimises races with live
/// Claude Code sessions rewriting the file. Fail-soft: never throws, never blocks a launch.
/// </summary>
public static class ClaudeTrust
{
    private static readonly JsonSerializerOptions WriteOpts = new() { WriteIndented = true };

    /// <param name="claudeJsonPath">Override for the ~\.claude.json path (tests).</param>
    /// <returns>True when the project is trusted on return (already or newly); false on any failure.</returns>
    public static bool EnsureTrusted(string projectPath, string? claudeJsonPath = null)
    {
        if (string.IsNullOrWhiteSpace(projectPath)) return false;
        var path = projectPath.TrimEnd('\\', '/');
        if (path.Length == 0) return false;

        claudeJsonPath ??= Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude.json");

        try
        {
            if (!File.Exists(claudeJsonPath)) return false;

            if (JsonNode.Parse(File.ReadAllText(claudeJsonPath)) is not JsonObject root)
                return false;

            if (root["projects"] is not JsonObject projects)
            {
                projects = [];
                root["projects"] = projects;
            }

            // Claude Code keys projects by exact path; match case-insensitively so we
            // update an existing Windows-path entry instead of duplicating it.
            var key = projects.Select(p => p.Key)
                .FirstOrDefault(k => string.Equals(k, path, StringComparison.OrdinalIgnoreCase)) ?? path;

            if (projects[key] is not JsonObject entry)
            {
                entry = [];
                projects[key] = entry;
            }

            if (entry["hasTrustDialogAccepted"]?.GetValueKind() == JsonValueKind.True)
                return true; // already trusted — don't touch the file

            entry["hasTrustDialogAccepted"] = true;

            // Atomic write: a crash mid-write must never truncate the real file.
            var temp = claudeJsonPath + ".tmp";
            File.WriteAllText(temp, root.ToJsonString(WriteOpts));
            File.Move(temp, claudeJsonPath, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException)
        {
            return false;
        }
    }

    /// <summary>
    /// Removes a project's entry from ~\.claude.json after the project is deleted.
    /// Same contract as EnsureTrusted: surgical merge, atomic write, no-op on a
    /// missing/unparseable file or absent entry, fail-soft (never throws).
    /// </summary>
    /// <param name="claudeJsonPath">Override for the ~\.claude.json path (tests).</param>
    /// <returns>True when an entry was removed; false otherwise.</returns>
    public static bool RemoveTrust(string projectPath, string? claudeJsonPath = null)
    {
        if (string.IsNullOrWhiteSpace(projectPath)) return false;
        var path = projectPath.TrimEnd('\\', '/');
        if (path.Length == 0) return false;

        claudeJsonPath ??= Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude.json");

        try
        {
            if (!File.Exists(claudeJsonPath)) return false;

            if (JsonNode.Parse(File.ReadAllText(claudeJsonPath)) is not JsonObject root)
                return false;

            if (root["projects"] is not JsonObject projects) return false;

            var key = projects.Select(p => p.Key)
                .FirstOrDefault(k => string.Equals(k, path, StringComparison.OrdinalIgnoreCase));
            if (key is null) return false; // nothing to remove — don't touch the file

            projects.Remove(key);

            // Atomic write: a crash mid-write must never truncate the real file.
            var temp = claudeJsonPath + ".tmp";
            File.WriteAllText(temp, root.ToJsonString(WriteOpts));
            File.Move(temp, claudeJsonPath, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException)
        {
            return false;
        }
    }
}
