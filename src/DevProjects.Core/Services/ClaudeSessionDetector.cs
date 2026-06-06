using System.Text.RegularExpressions;

namespace DevProjects.Core.Services;

/// <summary>Answers "does this project have a previous Claude session to continue?"</summary>
public interface IClaudeSessionDetector
{
    bool HasSession(string projectPath);

    /// <summary>
    /// UTC timestamp of the most recent transcript write for this project, or
    /// null when no transcripts exist. A very recent write means a session is
    /// (almost certainly) running right now — this is a heuristic, not a fact.
    /// </summary>
    DateTime? GetLatestActivityUtc(string projectPath);
}

/// <summary>
/// Detects prior sessions by probing %USERPROFILE%\.claude\projects\&lt;encoded-path&gt;
/// for .jsonl transcripts. The encoding (every non-alphanumeric character becomes
/// a dash) is an undocumented Claude Code internal — if it ever changes, the
/// only symptom is the Continue button reverting to always-enabled, because
/// callers should treat "no session found" as best-effort advice.
/// </summary>
public sealed partial class ClaudeSessionDetector : IClaudeSessionDetector
{
    [GeneratedRegex("[^A-Za-z0-9]")]
    private static partial Regex NonAlphanumeric();

    private readonly string _projectsDir;

    public ClaudeSessionDetector(string? projectsDir = null)
    {
        _projectsDir = projectsDir ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".claude", "projects");
    }

    public static string EncodeProjectPath(string projectPath) =>
        NonAlphanumeric().Replace(projectPath, "-");

    public bool HasSession(string projectPath)
    {
        try
        {
            // NTFS matches the directory name case-insensitively, which also covers
            // the mixed-case variants Claude Code produces (C--Dev... vs c--dev...).
            var dir = Path.Combine(_projectsDir, EncodeProjectPath(projectPath));
            return Directory.Exists(dir) &&
                   Directory.EnumerateFiles(dir, "*.jsonl").Any();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    public DateTime? GetLatestActivityUtc(string projectPath)
    {
        try
        {
            var dir = Path.Combine(_projectsDir, EncodeProjectPath(projectPath));
            if (!Directory.Exists(dir)) return null;
            DateTime? latest = null;
            foreach (var file in Directory.EnumerateFiles(dir, "*.jsonl"))
            {
                var writeUtc = File.GetLastWriteTimeUtc(file);
                if (latest is null || writeUtc > latest) latest = writeUtc;
            }
            return latest;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
