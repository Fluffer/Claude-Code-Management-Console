namespace Ccmc.Core.Models;

/// <summary>One entry from `git worktree list --porcelain`.</summary>
public sealed record GitWorktree(string Path, string? Branch, bool IsDetached, bool IsBare);
