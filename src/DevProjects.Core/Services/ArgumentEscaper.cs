using System.Text.RegularExpressions;

namespace DevProjects.Core.Services;

/// <summary>
/// Quotes process arguments per CommandLineToArgvW rules: any backslash run
/// preceding a quote (or the end of a quoted token) is doubled, then the
/// quote itself is escaped. Direct port of the PowerShell launcher's
/// ConvertTo-ArgumentString, which is covered by the original Pester suite.
/// </summary>
public static partial class ArgumentEscaper
{
    [GeneratedRegex(@"(\\*)""")]
    private static partial Regex BackslashesBeforeQuote();

    [GeneratedRegex(@"(\\+)$")]
    private static partial Regex TrailingBackslashes();

    public static string Quote(string arg)
    {
        if (arg.Length == 0) return "\"\"";
        if (!NeedsQuoting(arg)) return arg;
        var escaped = BackslashesBeforeQuote().Replace(arg, "$1$1\\\"");
        escaped = TrailingBackslashes().Replace(escaped, "$1$1");
        return "\"" + escaped + "\"";
    }

    public static string Join(IEnumerable<string> arguments) =>
        string.Join(' ', arguments.Select(Quote));

    private static bool NeedsQuoting(string arg) =>
        arg.Any(c => char.IsWhiteSpace(c) || c == '"');
}
