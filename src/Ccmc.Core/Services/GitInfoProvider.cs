using System.Collections.Concurrent;
using System.Diagnostics;
using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>
/// Supplies per-project git info for row decoration. Designed to never slow
/// the UI down: branch names are read straight from .git/HEAD (no process),
/// dirty state shells out to git with a concurrency cap and a hard timeout,
/// and results are cached with a short TTL.
/// </summary>
public sealed class GitInfoProvider
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan StatusTimeout = TimeSpan.FromMilliseconds(1500);

    private readonly SemaphoreSlim _gate = new(4);
    private readonly ConcurrentDictionary<string, (DateTime AtUtc, GitInfo? Info)> _cache =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly string? _gitPath;

    public GitInfoProvider(string? gitPath = null)
    {
        _gitPath = gitPath ?? CommandLocator.FindOnPath("git.exe");
    }

    public async Task<GitInfo?> GetAsync(string projectPath, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(projectPath, out var cached) &&
            DateTime.UtcNow - cached.AtUtc < CacheTtl)
        {
            return cached.Info;
        }

        var branch = ReadBranchFromHead(projectPath);
        if (branch is null)
        {
            _cache[projectPath] = (DateTime.UtcNow, null);
            return null;
        }

        bool? dirty = null;
        if (_gitPath is not null)
            dirty = await IsDirtyAsync(projectPath, ct).ConfigureAwait(false);

        var info = new GitInfo(branch, dirty);
        _cache[projectPath] = (DateTime.UtcNow, info);
        return info;
    }

    public void InvalidateCache() => _cache.Clear();

    /// <summary>Branch name from .git/HEAD without spawning a process. Handles worktree .git files.</summary>
    public static string? ReadBranchFromHead(string projectPath)
    {
        try
        {
            var gitDir = Path.Combine(projectPath, ".git");
            if (File.Exists(gitDir))
            {
                // Worktree/submodule: ".git" is a file containing "gitdir: <path>".
                var line = File.ReadAllLines(gitDir).FirstOrDefault(l => l.StartsWith("gitdir:", StringComparison.Ordinal));
                if (line is null) return null;
                gitDir = line["gitdir:".Length..].Trim();
                if (!Path.IsPathRooted(gitDir)) gitDir = Path.GetFullPath(Path.Combine(projectPath, gitDir));
            }
            var headFile = Path.Combine(gitDir, "HEAD");
            if (!File.Exists(headFile)) return null;

            var head = File.ReadAllText(headFile).Trim();
            const string refPrefix = "ref: refs/heads/";
            if (head.StartsWith(refPrefix, StringComparison.Ordinal))
                return head[refPrefix.Length..];
            // Detached HEAD: show a short hash.
            return head.Length >= 7 ? head[..7] : head;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private async Task<bool?> IsDirtyAsync(string projectPath, CancellationToken ct)
    {
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(StatusTimeout);

            var psi = new ProcessStartInfo
            {
                FileName = _gitPath!,
                WorkingDirectory = projectPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("status");
            psi.ArgumentList.Add("--porcelain");

            using var process = Process.Start(psi);
            if (process is null) return null;
            try
            {
                // Drain stderr concurrently — a full stderr pipe buffer would
                // deadlock git until the timeout kill on every call.
                var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);
                var output = await process.StandardOutput.ReadToEndAsync(timeoutCts.Token).ConfigureAwait(false);
                await process.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
                await stderrTask.ConfigureAwait(false);
                return process.ExitCode == 0 ? output.Length > 0 : null;
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
                return null;
            }
        }
        catch (Exception ex) when (ex is IOException or System.ComponentModel.Win32Exception)
        {
            return null;
        }
        finally
        {
            _gate.Release();
        }
    }
}
