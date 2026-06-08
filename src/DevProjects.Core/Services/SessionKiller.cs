using System.Diagnostics;

namespace DevProjects.Core.Services;

/// <summary>
/// Terminates running claude session processes. Fail-soft per PID.
/// Which PIDs to kill is decided by RunningClaudeDetector.SessionsForProject (unit-tested there).
/// </summary>
public static class SessionKiller
{
    /// <summary>Kill one PID and its child tree. Returns true if it was killed (or already gone).</summary>
    public static bool Kill(int pid)
    {
        try
        {
            using var p = Process.GetProcessById(pid);
            p.Kill(entireProcessTree: true);
            return true;
        }
        catch (ArgumentException) { return true; }        // already exited
        catch (InvalidOperationException) { return true; } // already exited
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception) { return false; } // access denied
    }
}
