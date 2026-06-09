using System.Diagnostics;
using DevProjects.Core.Models;

namespace DevProjects.Core.Services;

/// <summary>
/// Enumerates a repo's git worktrees. The porcelain parser is pure (tested); running git reuses
/// the GitInfoProvider gate+timeout discipline so it never stalls the UI.
/// </summary>
public sealed class GitWorktreeProvider
{
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(2000);
    private readonly SemaphoreSlim _gate = new(4);
    private readonly string? _gitPath;

    public GitWorktreeProvider(string? gitPath = null) =>
        _gitPath = gitPath ?? CommandLocator.FindOnPath("git.exe");

    /// <summary>Parse `git worktree list --porcelain`. Blank-line-separated stanzas.</summary>
    public static IReadOnlyList<GitWorktree> Parse(string output)
    {
        var result = new List<GitWorktree>();
        string? path = null, branch = null;
        bool detached = false, bare = false;

        void Flush()
        {
            if (path is not null) result.Add(new GitWorktree(path, branch, detached, bare));
            path = null; branch = null; detached = false; bare = false;
        }

        foreach (var raw in output.Replace("\r\n", "\n").Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0) { Flush(); continue; }
            if (line.StartsWith("worktree ", StringComparison.Ordinal)) path = line["worktree ".Length..].Trim();
            else if (line == "bare") bare = true;
            else if (line == "detached") detached = true;
            else if (line.StartsWith("branch ", StringComparison.Ordinal))
            {
                var refName = line["branch ".Length..].Trim();
                const string prefix = "refs/heads/";
                branch = refName.StartsWith(prefix, StringComparison.Ordinal) ? refName[prefix.Length..] : refName;
            }
        }
        Flush();
        return result;
    }

    /// <summary>Live worktrees for a repo, or empty when git is unavailable / the call fails.</summary>
    public async Task<IReadOnlyList<GitWorktree>> ListAsync(string repoPath, CancellationToken ct = default)
    {
        if (_gitPath is null) return [];
        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(Timeout);
            var psi = new ProcessStartInfo
            {
                FileName = _gitPath, WorkingDirectory = repoPath,
                RedirectStandardOutput = true, RedirectStandardError = true,
                UseShellExecute = false, CreateNoWindow = true,
            };
            psi.ArgumentList.Add("worktree");
            psi.ArgumentList.Add("list");
            psi.ArgumentList.Add("--porcelain");

            using var process = Process.Start(psi);
            if (process is null) return [];
            try
            {
                var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);
                var output = await process.StandardOutput.ReadToEndAsync(timeoutCts.Token).ConfigureAwait(false);
                await process.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
                await stderrTask.ConfigureAwait(false);
                return process.ExitCode == 0 ? Parse(output) : [];
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
                return [];
            }
        }
        catch (Exception ex) when (ex is IOException or System.ComponentModel.Win32Exception)
        {
            return [];
        }
        finally { _gate.Release(); }
    }
}
