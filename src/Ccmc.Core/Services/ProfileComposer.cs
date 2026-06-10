using System.Text;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>Composes a LaunchProfile into a flag string that AreFlagsSafe accepts. Pure.</summary>
public static class ProfileComposer
{
    public static string Compose(LaunchProfile profile)
    {
        var sb = new StringBuilder();
        AppendValue(sb, "--model", profile.Model);
        AppendValue(sb, "--permission-mode", profile.PermissionMode);
        AppendList(sb, "--allowedTools", profile.AllowedTools);
        AppendList(sb, "--disallowedTools", profile.DisallowedTools);
        return sb.ToString().Trim();
    }

    private static void AppendValue(StringBuilder sb, string flag, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        Guard(value);
        if (sb.Length > 0) sb.Append(' ');
        sb.Append(flag).Append(' ').Append(value.Trim());
    }

    private static void AppendList(StringBuilder sb, string flag, IReadOnlyList<string> tokens)
    {
        var clean = tokens.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).ToList();
        if (clean.Count == 0) return;
        foreach (var t in clean) Guard(t);
        if (sb.Length > 0) sb.Append(' ');
        sb.Append(flag).Append(' ').Append(string.Join(' ', clean));
    }

    // A profile token must be safe on its own AND contain no spaces (a space would split it
    // into two flag words). Reusing AreFlagsSafe keeps the rule in one place.
    private static void Guard(string token)
    {
        if (token.Contains(' ') || !LaunchCommandBuilder.AreFlagsSafe(token))
            throw new ArgumentException(
                $"Profile contains a token that is unsafe as a launcher flag: '{token}'. " +
                "Use plain tool names (Read, Edit, Bash); scoped specs like Bash(git:*) are not supported.");
    }
}
