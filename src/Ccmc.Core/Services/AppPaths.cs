namespace Ccmc.Core.Services;

/// <summary>
/// Resolves the per-user application-data directory for Claude Code Management
/// Console (<c>%APPDATA%\ccmc</c>) and performs a one-time migration from the
/// pre-rebrand <c>%APPDATA%\Dev-Projects</c> folder.
///
/// The legacy folder is <em>copied</em>, not moved, so the deprecated PowerShell
/// launcher fallback keeps its own data intact. Migration runs once: as soon as
/// the new folder exists it is never touched again.
/// </summary>
public static class AppPaths
{
    public const string AppDataFolderName = "ccmc";
    private const string LegacyFolderName = "Dev-Projects";

    /// <summary>Full path to <c>%APPDATA%\ccmc</c>. Resolving it triggers the one-time legacy migration.</summary>
    public static string AppDataDir { get; } = Resolve();

    private static string Resolve()
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var dir = Path.Combine(root, AppDataFolderName);
        TryMigrateLegacy(root, dir);
        return dir;
    }

    private static void TryMigrateLegacy(string root, string dir)
    {
        try
        {
            if (Directory.Exists(dir)) return; // already migrated (or fresh install that ran once)
            var legacy = Path.Combine(root, LegacyFolderName);
            if (!Directory.Exists(legacy)) return; // nothing to carry over
            // Stage into a temp sibling, then rename: an interrupted copy must
            // never leave a half-populated ccmc folder, which the guard above
            // would treat as "already migrated" and silently strand the data.
            var staging = dir + ".migrating";
            if (Directory.Exists(staging)) Directory.Delete(staging, recursive: true);
            CopyDirectory(legacy, staging);
            Directory.Move(staging, dir);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Migration is best-effort: a locked/denied legacy folder must never
            // take startup down. The services fall back to fresh defaults.
        }
    }

    private static void CopyDirectory(string source, string dest)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.GetFiles(source))
            File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), overwrite: false);
        foreach (var sub in Directory.GetDirectories(source))
            CopyDirectory(sub, Path.Combine(dest, Path.GetFileName(sub)));
    }
}
