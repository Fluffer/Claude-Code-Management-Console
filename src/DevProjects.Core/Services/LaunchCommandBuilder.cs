using DevProjects.Core.Models;

namespace DevProjects.Core.Services;

/// <summary>
/// Builds the process invocation for a session launch:
/// wt.exe -w 0 new-tab --title &lt;name&gt; -d &lt;path&gt; &lt;shell&gt; -NoExit -Command "claude ..."
/// with a plain shell fallback when Windows Terminal is unavailable.
/// </summary>
public static class LaunchCommandBuilder
{
    // The claude command line is handed to PowerShell via -Command, so these
    // characters would be interpreted as shell operators / expansions rather
    // than reaching claude. Blocking them turns a quiet foot-gun (or injection
    // vector) into a clear validation error.
    private static readonly char[] UnsafeFlagChars =
        [';', '|', '&', '$', '`', '(', ')', '{', '}', '<', '>', '\n', '\r', '#'];

    public const string UnsafeFlagMessage =
        "Flags may not contain shell characters: ; | & $ ` ( ) { } < > #";

    public static bool AreFlagsSafe(string flags) => flags.IndexOfAny(UnsafeFlagChars) < 0;

    public static string BuildClaudeCommand(string flags, bool continueSession)
    {
        if (!AreFlagsSafe(flags))
            throw new ArgumentException(UnsafeFlagMessage, nameof(flags));
        var command = "claude";
        if (continueSession) command += " --continue";
        if (!string.IsNullOrWhiteSpace(flags)) command += " " + flags.Trim();
        return command;
    }

    public static LaunchSpec Build(
        string projectName,
        string projectPath,
        string flags,
        bool continueSession,
        string? shell = null,
        string? wtPath = null,
        bool probeWindowsTerminal = true)
    {
        shell ??= CommandLocator.GetPreferredShell();
        if (wtPath is null && probeWindowsTerminal)
            wtPath = CommandLocator.FindWindowsTerminal();

        var claudeCommand = BuildClaudeCommand(flags, continueSession);

        if (!string.IsNullOrWhiteSpace(wtPath))
        {
            string[] wtArgs =
            [
                "-w", "0", "new-tab", "--title", projectName, "-d", projectPath,
                shell, "-NoExit", "-Command", claudeCommand,
            ];
            return new LaunchSpec(wtPath, ArgumentEscaper.Join(wtArgs), null);
        }

        return new LaunchSpec(
            shell,
            ArgumentEscaper.Join(["-NoExit", "-Command", claudeCommand]),
            projectPath);
    }
}
