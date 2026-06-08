using System.Diagnostics;

namespace DevProjects.Core.Services;

/// <summary>Locates the claude CLI and reports its version (cached per app run).</summary>
public sealed class ClaudeCliService
{
    private readonly Lazy<string?> _claudePath = new(() => CommandLocator.FindOnPath("claude"));
    private Task<string?>? _versionTask;

    public bool IsOnPath => _claudePath.Value is not null;

    /// <summary>claude --version output, e.g. "2.1.0 (Claude Code)". Null when unavailable.</summary>
    public Task<string?> GetVersionAsync()
    {
        return _versionTask ??= QueryVersionAsync();
    }

    private async Task<string?> QueryVersionAsync()
    {
        var path = _claudePath.Value;
        if (path is null) return null;
        try
        {
            var psi = new ProcessStartInfo
            {
                // .cmd shims need cmd.exe; running the path through cmd /c covers both.
                FileName = "cmd.exe",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("/c");
            psi.ArgumentList.Add(path);
            psi.ArgumentList.Add("--version");

            using var process = Process.Start(psi);
            if (process is null) return null;
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var output = await process.StandardOutput.ReadToEndAsync(cts.Token).ConfigureAwait(false);
            await process.WaitForExitAsync(cts.Token).ConfigureAwait(false);
            return process.ExitCode == 0 ? output.Trim() : null;
        }
        catch (Exception ex) when (
            ex is OperationCanceledException or IOException or System.ComponentModel.Win32Exception)
        {
            return null;
        }
    }

    /// <summary>
    /// Latest published version of @anthropic-ai/claude-code from the npm registry,
    /// or null on any failure. Fail-soft: a missing answer simply means "don't nag".
    /// </summary>
    public async Task<string?> GetLatestPublishedVersionAsync()
    {
        try
        {
            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var json = await http.GetStringAsync(
                "https://registry.npmjs.org/@anthropic-ai/claude-code/latest").ConfigureAwait(false);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("version", out var v) ? v.GetString() : null;
        }
        catch (Exception ex) when (
            ex is System.Net.Http.HttpRequestException or TaskCanceledException
               or System.Text.Json.JsonException or IOException)
        {
            return null;
        }
    }
}
