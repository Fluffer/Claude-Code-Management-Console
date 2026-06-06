namespace DevProjects.Core.Services;

/// <summary>
/// Renames a project folder or moves it to a different source root.
/// Callers are responsible for migrating config/pin entries afterwards
/// (ConfigService.MigrateProjectPath) and rescanning.
/// </summary>
public static class ProjectMover
{
    /// <summary>Renames the folder in place. Returns the new full path.</summary>
    public static string Rename(string projectPath, string newName)
    {
        var parent = Path.GetDirectoryName(projectPath.TrimEnd('\\', '/'))
            ?? throw new ArgumentException($"Cannot determine parent of: {projectPath}");
        var trimmed = newName.Trim();
        var oldName = Path.GetFileName(projectPath.TrimEnd('\\', '/'));
        var destination = Path.Combine(parent, trimmed);

        // Case-only rename (myproj -> MyProj): NTFS reports the target as
        // "already existing", so validate chars only and go via a temp name.
        if (string.Equals(oldName, trimmed, StringComparison.OrdinalIgnoreCase) && oldName != trimmed)
        {
            if (trimmed.IndexOfAny(['<', '>', ':', '"', '/', '\\', '|', '?', '*']) >= 0)
                throw new ArgumentException("Project name contains invalid characters: < > : \" / \\ | ? *");
            var temp = destination + ".renaming-tmp";
            Directory.Move(projectPath, temp);
            Directory.Move(temp, destination);
            return destination;
        }

        var error = ProjectNameValidator.GetError(trimmed, parent);
        if (error is not null) throw new ArgumentException(error);
        Directory.Move(projectPath, destination);
        return destination;
    }

    /// <summary>Moves the folder (keeping its name) under another root. Returns the new full path.</summary>
    public static string MoveToRoot(string projectPath, string targetRoot)
    {
        if (!Directory.Exists(targetRoot))
            throw new DirectoryNotFoundException($"Target root does not exist: {targetRoot}");
        // Directory.Move cannot cross volumes — fail with a clear message instead
        // of a misleading IOException.
        if (!string.Equals(Path.GetPathRoot(Path.GetFullPath(projectPath)),
                Path.GetPathRoot(Path.GetFullPath(targetRoot)), StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException(
                "Cannot move a project to a different drive — choose a root on the same drive.");
        if ((Path.GetFullPath(targetRoot).TrimEnd('\\', '/') + Path.DirectorySeparatorChar)
                .StartsWith(Path.GetFullPath(projectPath).TrimEnd('\\', '/') + Path.DirectorySeparatorChar,
                    StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Cannot move a project into one of its own subfolders.");
        var name = Path.GetFileName(projectPath.TrimEnd('\\', '/'));
        var destination = Path.Combine(targetRoot, name);
        if (string.Equals(Path.GetFullPath(destination), Path.GetFullPath(projectPath),
                StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("The project is already in that root.");
        if (Directory.Exists(destination) || File.Exists(destination))
            throw new ArgumentException($"A folder named '{name}' already exists in {targetRoot}.");
        Directory.Move(projectPath, destination);
        return destination;
    }
}
