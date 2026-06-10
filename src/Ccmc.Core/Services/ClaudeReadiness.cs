namespace Ccmc.Core.Services;

/// <summary>Cheap "can Claude start cleanly here?" checks. Filesystem only, no network.</summary>
public static class ClaudeReadiness
{
    /// <summary>True if the user's .claude dir is writable, or absent but the home dir is writable.</summary>
    public static bool IsClaudeDirWritable(string? homeDir = null)
    {
        homeDir ??= Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!Directory.Exists(homeDir)) return false;
        var claudeDir = Path.Combine(homeDir, ".claude");
        var probeDir = Directory.Exists(claudeDir) ? claudeDir : homeDir;
        try
        {
            var probe = Path.Combine(probeDir, ".devprojects-write-probe");
            File.WriteAllText(probe, "");
            File.Delete(probe);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
