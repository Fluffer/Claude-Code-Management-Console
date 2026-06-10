using Microsoft.Win32;

namespace Ccmc.App.Services;

/// <summary>
/// Registers the ccmc:// URL protocol for the current user, pointing at this exe.
/// Needed because the packaged-manifest registration does not apply to the
/// unpackaged publish (the daily driver). Idempotent and best-effort: a denied
/// registry write degrades copied links but must never take startup down.
/// </summary>
public static class ProtocolRegistrar
{
    public static void EnsureRegistered()
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (exe is null) return;
            var command = $"\"{exe}\" \"%1\"";
            using var root = Registry.CurrentUser.CreateSubKey(
                @"Software\Classes\" + Ccmc.Core.Services.DeepLinkParser.Scheme);
            root.SetValue(null, "URL:Claude Code Management Console");
            root.SetValue("URL Protocol", "");
            using var cmd = root.CreateSubKey(@"shell\open\command");
            // Skip the write when current — avoids churning the registry every launch.
            if (cmd.GetValue(null) as string != command)
                cmd.SetValue(null, command);
        }
        catch (Exception ex) when (ex is System.Security.SecurityException
                                       or UnauthorizedAccessException or IOException)
        {
        }
    }
}
