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
        "Flags may not contain shell characters (; | & $ ` ( ) { } < > #) or line breaks.";

    public static bool AreFlagsSafe(string flags) => flags.IndexOfAny(UnsafeFlagChars) < 0;

    public static string BuildClaudeCommand(
        string flags, bool continueSession, string? initialPrompt = null, string? name = null)
    {
        ArgumentNullException.ThrowIfNull(flags);
        if (!AreFlagsSafe(flags))
            throw new ArgumentException(UnsafeFlagMessage, nameof(flags));
        var command = "claude";
        // -n sets the claude session display name AND the terminal title, which claude
        // holds for the life of the session (WT --title alone is overwritten at launch).
        // Single-quoted for PowerShell -Command; every ' doubled. Not run through
        // AreFlagsSafe — single quoting makes an arbitrary folder name safe.
        if (!string.IsNullOrWhiteSpace(name))
            command += " -n '" + name.Replace("'", "''") + "'";
        if (continueSession) command += " --continue";
        else if (!string.IsNullOrWhiteSpace(initialPrompt))
            command += " '" + initialPrompt.Replace("'", "''") + "'";
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
        bool probeWindowsTerminal = true,
        string? initialPrompt = null)
    {
        shell ??= CommandLocator.GetPreferredShell();
        if (wtPath is null && probeWindowsTerminal)
            wtPath = CommandLocator.FindWindowsTerminal();

        var claudeCommand = BuildClaudeCommand(flags, continueSession, initialPrompt, projectName);

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
