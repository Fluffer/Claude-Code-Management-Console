using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>A snapshot of the facts a SavedFilter tests. The VM fills this from its rows.</summary>
public readonly record struct ProjectFacts(
    string Path, bool HasGit, bool HasClaudeMd, bool IsRunning, bool IsPinned);

/// <summary>Pure evaluation of a SavedFilter against ProjectFacts. AND semantics; unset = pass.</summary>
public static class ProjectFilter
{
    public static bool Matches(SavedFilter filter, ProjectFacts facts)
    {
        ArgumentNullException.ThrowIfNull(filter);
        if (!string.IsNullOrWhiteSpace(filter.PathContains) &&
            facts.Path.IndexOf(filter.PathContains, StringComparison.OrdinalIgnoreCase) < 0)
            return false;
        if (filter.RequireGit && !facts.HasGit) return false;
        if (filter.RequireClaudeMd && !facts.HasClaudeMd) return false;
        if (filter.RequireRunning && !facts.IsRunning) return false;
        if (filter.RequirePinned && !facts.IsPinned) return false;
        return true;
    }
}
