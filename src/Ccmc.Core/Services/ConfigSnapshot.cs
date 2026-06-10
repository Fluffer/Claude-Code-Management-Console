namespace Ccmc.Core.Services;

/// <summary>
/// Auto-snapshots config.json into a sibling "snapshots" folder on each save, keeping the N most
/// recent. Restore is a manual file copy — there is intentionally NO import path (the roadmap demoted
/// manual round-trips as a schema-breakage risk). Fail-soft: a snapshot failure never blocks the save.
/// </summary>
public static class ConfigSnapshot
{
    public static string? Write(string configPath, DateTime stampUtc, int keep = 10)
    {
        try
        {
            if (!File.Exists(configPath)) return null;
            var dir = Path.Combine(Path.GetDirectoryName(configPath)!, "snapshots");
            Directory.CreateDirectory(dir);
            var dest = Path.Combine(dir, $"config-{stampUtc:yyyyMMdd-HHmmss}.json");
            File.Copy(configPath, dest, overwrite: true);
            Prune(dir, keep);
            return dest;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    private static void Prune(string dir, int keep)
    {
        var files = Directory.GetFiles(dir, "config-*.json")
            .OrderByDescending(f => f, StringComparer.Ordinal) // timestamped names sort chronologically
            .ToList();
        foreach (var stale in files.Skip(keep))
            try { File.Delete(stale); } catch (IOException) { }
    }
}
