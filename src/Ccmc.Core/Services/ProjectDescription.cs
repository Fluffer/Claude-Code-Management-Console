using System.Collections.Concurrent;
using System.Text;
using System.Text.RegularExpressions;

namespace Ccmc.Core.Services;

/// <summary>
/// Extracts a one-line project description from README.md (preferred) or CLAUDE.md:
/// the first meaningful markdown line, with headings, badges, fences, frontmatter,
/// HTML and blockquotes skipped. Results are cached per file by last-write time,
/// so rescans only re-read files that changed. Never throws — any IO problem
/// just means "no description".
/// </summary>
public static class ProjectDescription
{
    private const int MaxReadBytes = 4096;
    private const int MaxLength = 200;

    private static readonly ConcurrentDictionary<string, (DateTime MTimeUtc, string? Desc)> Cache =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly Regex MdLink = new(@"\[([^\]]*)\]\([^)]*\)", RegexOptions.Compiled);

    public static string Get(string projectPath)
    {
        foreach (var candidate in (string[])["README.md", "CLAUDE.md"])
        {
            var desc = FromFile(Path.Combine(projectPath, candidate));
            if (!string.IsNullOrEmpty(desc)) return desc;
        }
        return "";
    }

    private static string? FromFile(string filePath)
    {
        try
        {
            var fi = new FileInfo(filePath);
            if (!fi.Exists) return null;
            if (Cache.TryGetValue(filePath, out var hit) && hit.MTimeUtc == fi.LastWriteTimeUtc)
                return hit.Desc;

            var desc = Extract(ReadHead(filePath));
            Cache[filePath] = (fi.LastWriteTimeUtc, desc);
            return desc;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static string ReadHead(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var buffer = new byte[MaxReadBytes];
        var read = stream.Read(buffer, 0, buffer.Length);
        return Encoding.UTF8.GetString(buffer, 0, read);
    }

    private static string? Extract(string markdown)
    {
        var inFence = false;
        var inFrontmatter = false;
        var seenContent = false;

        foreach (var raw in markdown.Split('\n'))
        {
            var line = raw.TrimEnd('\r').Trim();

            // YAML frontmatter: a "---" before any content opens it, the next "---" closes it.
            if (line == "---" && !seenContent && !inFrontmatter) { inFrontmatter = true; continue; }
            if (inFrontmatter) { if (line == "---") inFrontmatter = false; continue; }

            if (line.StartsWith("```")) { inFence = !inFence; seenContent = true; continue; }
            if (inFence) continue;
            if (line.Length == 0) continue;

            seenContent = true;
            if (line.StartsWith('#')) continue;
            if (line.StartsWith("![") || line.StartsWith("[![")) continue;
            if (line.StartsWith('<')) continue;
            if (line.StartsWith('>')) continue;
            if (line is "---" or "***" or "___") continue;

            var text = StripInline(line);
            if (text.Length == 0) continue;
            return text.Length <= MaxLength ? text : text[..MaxLength].TrimEnd() + "…";
        }
        return null;
    }

    private static string StripInline(string line)
    {
        var s = MdLink.Replace(line, "$1");
        s = s.Replace("**", "").Replace("__", "").Replace("`", "");
        return s.Trim('*', '_', ' ');
    }
}
