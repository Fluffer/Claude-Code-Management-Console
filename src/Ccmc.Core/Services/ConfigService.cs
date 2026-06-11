using System.Text.Json;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>
/// Loads and saves config.json with the same path, schema and corruption
/// behaviour as the original PowerShell launcher: a corrupt file is renamed
/// to config.json.bad and defaults are regenerated.
/// </summary>
public sealed class ConfigService
{
    internal static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    public string ConfigPath { get; }

    public ConfigService(string? configPath = null)
    {
        ConfigPath = configPath ?? Path.Combine(AppPaths.AppDataDir, "config.json");
    }

    public LauncherConfig Load()
    {
        if (!File.Exists(ConfigPath))
        {
            var fresh = LauncherConfig.CreateDefault();
            Save(fresh);
            return fresh;
        }

        LauncherConfig? config;
        try
        {
            config = JsonSerializer.Deserialize<LauncherConfig>(
                File.ReadAllText(ConfigPath), JsonOpts);
            if (config is null) throw new JsonException("null document");
        }
        catch (JsonException)
        {
            QuarantineCorruptFile();
            var fresh = LauncherConfig.CreateDefault();
            Save(fresh);
            return fresh;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Transient read failure (file locked, permissions). Work from
            // defaults in memory but do NOT save — the file on disk may be
            // perfectly fine and must not be clobbered.
            return LauncherConfig.CreateDefault();
        }

        Normalize(config);
        return config;
    }

    public void Save(LauncherConfig config)
    {
        try
        {
            var dir = Path.GetDirectoryName(ConfigPath)!;
            Directory.CreateDirectory(dir);
            // Atomic write: a crash mid-write must never truncate the real file.
            // UTF-8 without BOM, matching the PowerShell launcher's output.
            var temp = ConfigPath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(config, JsonOpts));
            File.Move(temp, ConfigPath, overwrite: true);
            // Best-effort timestamped snapshot for manual recovery; never blocks the save.
            ConfigSnapshot.Write(ConfigPath, DateTime.UtcNow);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Best-effort persistence: a locked file (e.g. the old PS launcher
            // mid-write) shouldn't crash the app; the next save retries.
        }
    }

    /// <summary>Stamps lastUsed (UTC, round-trip format) and flags for a project, then saves.</summary>
    public void UpdateUsage(LauncherConfig config, string projectPath, string flags)
    {
        config.Projects ??= new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase);
        if (!config.Projects.TryGetValue(projectPath, out var usage))
        {
            usage = new ProjectUsage();
            config.Projects[projectPath] = usage;
        }
        usage.LastUsed = DateTime.UtcNow.ToString("o");
        usage.Flags = flags;
        Save(config);
    }

    /// <summary>Saves flags for a project without bumping lastUsed.</summary>
    public void UpdateFlags(LauncherConfig config, string projectPath, string flags)
    {
        config.Projects ??= new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase);
        if (!config.Projects.TryGetValue(projectPath, out var usage))
        {
            usage = new ProjectUsage();
            config.Projects[projectPath] = usage;
        }
        usage.Flags = flags;
        Save(config);
    }

    /// <summary>Re-keys a project's usage entry after a rename/move, then saves.</summary>
    public void MigrateProjectPath(LauncherConfig config, string oldPath, string newPath)
    {
        config.Projects ??= new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase);
        if (config.Projects.TryGetValue(oldPath, out var usage))
        {
            config.Projects.Remove(oldPath);
            config.Projects[newPath] = usage;
            Save(config);
        }
    }

    private void QuarantineCorruptFile()
    {
        var bad = ConfigPath + ".bad";
        try
        {
            if (File.Exists(bad)) File.Delete(bad);
            File.Move(ConfigPath, bad);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Quarantine is best-effort; Save() below overwrites the corrupt file anyway.
        }
    }

    /// <summary>Backfills properties missing from older or hand-edited configs.</summary>
    private static void Normalize(LauncherConfig config)
    {
        var defaults = LauncherConfig.CreateDefault();
        config.Roots ??= defaults.Roots;
        config.DefaultRoot ??= defaults.DefaultRoot;
        config.Ignore ??= [];
        config.Hidden ??= [];
        // Re-wrap to guarantee case-insensitive path keys regardless of how JSON deserialized it.
        config.Projects = config.Projects is null
            ? new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, ProjectUsage>(config.Projects, StringComparer.OrdinalIgnoreCase);
        config.Roots = config.Roots!.Where(r => !string.IsNullOrWhiteSpace(r)).ToList();
        config.Ignore = config.Ignore!.Where(i => !string.IsNullOrWhiteSpace(i)).ToList();
        config.Hidden = config.Hidden!.Where(h => !string.IsNullOrWhiteSpace(h)).ToList();
    }
}
