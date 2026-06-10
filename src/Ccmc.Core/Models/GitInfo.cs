namespace Ccmc.Core.Models;

/// <summary>Lightweight git status for a project row.</summary>
/// <param name="Branch">Current branch name, or a short commit hash when detached.</param>
/// <param name="IsDirty">True when the working tree has uncommitted changes; null when unknown (git CLI unavailable or timed out).</param>
public sealed record GitInfo(string Branch, bool? IsDirty);
