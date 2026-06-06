using System.Diagnostics;

namespace DevProjects.Core.Services;

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
    /// Working directories (no trailing separator) of all processes that look
    /// like a Claude CLI session. Best-effort: processes we cannot inspect
    /// (died mid-scan, access denied) are skipped silently.
    /// </summary>
    public IReadOnlySet<string> GetRunningClaudeDirectories()
    {
        var directories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
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

                        cwd = cwd.TrimEnd('\\', '/');
                        if (cwd.Length > 0) directories.Add(cwd);
                    }
                    catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
                    {
                        // Process exited mid-scan or is inaccessible — skip.
                    }
                }
            }
        }
        return directories;
    }

    /// <summary>
    /// True when any running Claude process has its working directory at — or
    /// anywhere under — the project folder.
    /// </summary>
    public static bool IsProjectRunning(IReadOnlySet<string> runningDirectories, string projectPath)
    {
        var normalized = projectPath.TrimEnd('\\', '/');
        if (runningDirectories.Contains(normalized)) return true;
        var prefix = normalized + System.IO.Path.DirectorySeparatorChar;
        return runningDirectories.Any(d => d.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }
}
