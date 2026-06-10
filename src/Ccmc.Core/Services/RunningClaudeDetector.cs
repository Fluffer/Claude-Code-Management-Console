using System.Diagnostics;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>
/// Finds the working directories of Claude CLI processes that are running
/// right now. Primary signal for the "live" badge — far more robust than
/// transcript-write heuristics, since an idle session stops writing but its
/// process keeps running.
/// </summary>
public sealed class RunningClaudeDetector
{
    // claude installs either as a native claude.exe or as an npm shim that
    // ultimately runs node.exe with the claude cli script.
    private static readonly string[] CandidateProcessNames = ["claude", "node", "bun"];

    /// <summary>
    /// All processes that look like a Claude CLI session, each with PID,
    /// process name, and working directory (no trailing separator).
    /// Best-effort: processes we cannot inspect (died mid-scan, access denied)
    /// are skipped silently.
    /// </summary>
    public IReadOnlyList<RunningSession> GetRunningSessions()
    {
        var sessions = new List<RunningSession>();
        foreach (var name in CandidateProcessNames)
        {
            Process[] processes;
            try { processes = Process.GetProcessesByName(name); }
            catch (InvalidOperationException) { continue; }

            foreach (var process in processes)
            {
                using (process)
                {
                    try
                    {
                        var parameters = ProcessInspector.ReadProcessParameters(process.Id);
                        if (parameters is null) continue;
                        var (cwd, commandLine) = parameters.Value;

                        // claude.exe is unambiguous; for generic hosts (node/bun)
                        // require "claude" somewhere in the command line so other
                        // node apps don't light up rows.
                        if (!string.Equals(name, "claude", StringComparison.OrdinalIgnoreCase) &&
                            !commandLine.Contains("claude", StringComparison.OrdinalIgnoreCase))
                            continue;

                        cwd = TrimCwd(cwd);
                        if (cwd.Length > 0) sessions.Add(new RunningSession(process.Id, name, cwd));
                    }
                    catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
                    {
                        // Process exited mid-scan or is inaccessible — skip.
                    }
                }
            }
        }
        return sessions;
    }

    /// <summary>
    /// Working directories (no trailing separator) of all processes that look
    /// like a Claude CLI session. Best-effort: processes we cannot inspect
    /// (died mid-scan, access denied) are skipped silently.
    /// </summary>
    public IReadOnlySet<string> GetRunningClaudeDirectories()
    {
        var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var session in GetRunningSessions())
            directories.Add(session.WorkingDirectory);
        return directories;
    }

    /// <summary>
    /// True when any running Claude process has its working directory at — or
    /// anywhere under — the project folder.
    /// </summary>
    public static bool IsProjectRunning(IReadOnlySet<string> runningDirectories, string projectPath)
    {
        var normalized = TrimCwd(projectPath);
        if (runningDirectories.Contains(normalized)) return true;
        var prefix = normalized + System.IO.Path.DirectorySeparatorChar;
        return runningDirectories.Any(d => d.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Returns the sessions whose working directory is exactly <paramref name="projectPath"/>
    /// or is anywhere under it.
    /// </summary>
    public static IEnumerable<RunningSession> SessionsForProject(
        IEnumerable<RunningSession> sessions, string projectPath)
    {
        var normalized = TrimCwd(projectPath);
        foreach (var s in sessions)
        {
            if (string.Equals(s.WorkingDirectory, normalized, StringComparison.OrdinalIgnoreCase)) yield return s;
            else if (s.WorkingDirectory.StartsWith(normalized + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                yield return s;
        }
    }

    private static string TrimCwd(string cwd) => cwd.TrimEnd('\\', '/');
}
