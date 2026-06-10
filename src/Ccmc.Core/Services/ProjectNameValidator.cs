namespace Ccmc.Core.Services;

/// <summary>Validates a new project name against a destination root.</summary>
public static class ProjectNameValidator
{
    private static readonly char[] InvalidChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    /// <summary>Returns a user-facing error message, or null when the name is valid.</summary>
    public static string? GetError(string name, string root)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "Project name cannot be empty.";
        if (name.IndexOfAny(InvalidChars) >= 0)
            return "Project name contains invalid characters: < > : \" / \\ | ? *";
        var target = Path.Combine(root, name.Trim());
        if (Directory.Exists(target) || File.Exists(target))
            return $"A folder named '{name.Trim()}' already exists in {root}.";
        return null;
    }

    public static string CreateProjectFolder(string root, string name)
    {
        if (!Directory.Exists(root))
            throw new DirectoryNotFoundException($"Root folder does not exist: {root}");
        var path = Path.Combine(root, name.Trim());
        Directory.CreateDirectory(path);
        return path;
    }
}
