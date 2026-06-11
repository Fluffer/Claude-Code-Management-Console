using Ccmc.Core.Models;

namespace Ccmc.Core.Services;

/// <summary>Search-box matching: case-insensitive substring on name or description.</summary>
public static class ProjectSearch
{
    public static bool Matches(ProjectInfo project, string term) =>
        project.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ||
        project.Description.Contains(term, StringComparison.OrdinalIgnoreCase);
}
