namespace Ccmc.Core.Services;

/// <summary>Resolves executables the way the shell would (PATH + PATHEXT).</summary>
public static class CommandLocator
{
    /// <summary>
    /// Finds a command on PATH, honouring PATHEXT so npm shims (claude.cmd)
    /// and store aliases resolve like they would in a terminal.
    /// </summary>
    public static string? FindOnPath(string command)
    {
        var pathExt = (Environment.GetEnvironmentVariable("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var extensions = Path.HasExtension(command)
            ? new[] { "" }
            : pathExt;

        var paths = (Environment.GetEnvironmentVariable("PATH") ?? "")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var dir in paths)
        {
            foreach (var ext in extensions)
            {
                try
                {
                    var candidate = Path.Combine(dir, command + ext);
                    if (File.Exists(candidate)) return candidate;
                }
                catch (ArgumentException)
                {
                    // Malformed PATH entry — skip it.
                }
            }
        }
        return null;
    }

    /// <summary>wt.exe from PATH, falling back to the Store App Execution Alias.</summary>
    public static string? FindWindowsTerminal()
    {
        var onPath = FindOnPath("wt.exe");
        if (onPath is not null) return onPath;
        var alias = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Microsoft", "WindowsApps", "wt.exe");
        return File.Exists(alias) ? alias : null;
    }

    /// <summary>Prefers PowerShell 7 (pwsh) and falls back to Windows PowerShell.</summary>
    public static string GetPreferredShell() =>
        FindOnPath("pwsh.exe") is not null ? "pwsh" : "powershell";
}
