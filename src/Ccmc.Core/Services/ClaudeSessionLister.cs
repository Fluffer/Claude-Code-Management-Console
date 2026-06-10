using System.Text.Json;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>
/// Lists resumable sessions for a project from %USERPROFILE%\.claude\projects\&lt;encoded&gt;.
/// Reads ONLY the first line of each transcript for a preview — never the message body
/// stream — so it stays durable across Claude Code transcript-schema changes.
/// </summary>
public sealed class ClaudeSessionLister
{
    private readonly string _projectsDir;

    public ClaudeSessionLister(string? projectsDir = null)
    {
        _projectsDir = projectsDir ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "projects");
    }

    public IReadOnlyList<SessionSummary> ListSessions(string projectPath)
    {
        var result = new List<SessionSummary>();
        try
        {
            var dir = Path.Combine(_projectsDir, ClaudeSessionDetector.EncodeProjectPath(projectPath));
            if (!Directory.Exists(dir)) return result;
            foreach (var file in Directory.EnumerateFiles(dir, "*.jsonl"))
            {
                result.Add(new SessionSummary(
                    Path.GetFileNameWithoutExtension(file),
                    File.GetLastWriteTimeUtc(file),
                    ReadFirstUserMessage(file)));
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
        return result.OrderByDescending(s => s.LastWriteUtc).ToList();
    }

    /// <summary>Most recent transcript mtime for a project, or null when it has none. Stats only — no reads.</summary>
    public DateTime? NewestSessionUtc(string projectPath)
    {
        try
        {
            var dir = Path.Combine(_projectsDir, ClaudeSessionDetector.EncodeProjectPath(projectPath));
            if (!Directory.Exists(dir)) return null;
            DateTime? newest = null;
            foreach (var file in Directory.EnumerateFiles(dir, "*.jsonl"))
            {
                var t = File.GetLastWriteTimeUtc(file);
                if (newest is null || t > newest) newest = t;
            }
            return newest;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    private static string ReadFirstUserMessage(string file)
    {
        try
        {
            using var reader = new StreamReader(file);
            for (var line = reader.ReadLine(); line is not null; line = reader.ReadLine())
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var text = ExtractText(line);
                if (text is not null) return Truncate(text, 120);
                break;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        return "";
    }

    private static string? ExtractText(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            var msg = root.TryGetProperty("message", out var m) ? m : root;
            if (msg.TryGetProperty("content", out var content))
            {
                if (content.ValueKind == JsonValueKind.String) return content.GetString();
                if (content.ValueKind == JsonValueKind.Array)
                    foreach (var part in content.EnumerateArray())
                        if (part.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                            return t.GetString();
            }
        }
        catch (JsonException) { }
        return null;
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…";
}
