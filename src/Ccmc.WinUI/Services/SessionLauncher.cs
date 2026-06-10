using System.Diagnostics;
using Ccmc.Core.Models;

namespace Ccmc.App.Services;

/// <summary>Spawns the terminal process described by a LaunchSpec.</summary>
public static class SessionLauncher
{
    public static void Launch(LaunchSpec spec)
    {
        var psi = new ProcessStartInfo
        {
            FileName = spec.FilePath,
            Arguments = spec.Arguments,
            UseShellExecute = true,
        };
        if (spec.WorkingDirectory is not null)
            psi.WorkingDirectory = spec.WorkingDirectory;
        using var process = Process.Start(psi);
        if (process is null)
            throw new InvalidOperationException($"Failed to start '{spec.FilePath}'.");
    }
}
