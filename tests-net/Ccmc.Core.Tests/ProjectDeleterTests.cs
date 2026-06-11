using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public sealed class ProjectDeleterTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-delete-").FullName;

    public void Dispose()
    {
        // Tests may leave read-only leftovers on failure; clear before cleanup.
        if (!Directory.Exists(_dir)) return;
        foreach (var entry in Directory.EnumerateFileSystemEntries(_dir, "*", SearchOption.AllDirectories))
            File.SetAttributes(entry, FileAttributes.Normal);
        Directory.Delete(_dir, recursive: true);
    }

    [Fact]
    public void Permanent_DeletesTree_IncludingReadOnlyFiles()
    {
        // Git object/pack files are read-only; a plain recursive delete fails on them.
        var proj = Directory.CreateDirectory(Path.Combine(_dir, "Proj"));
        var objects = Directory.CreateDirectory(Path.Combine(proj.FullName, ".git", "objects"));
        var packFile = Path.Combine(objects.FullName, "pack-abc.idx");
        File.WriteAllText(packFile, "x");
        File.SetAttributes(packFile, FileAttributes.ReadOnly);

        ProjectDeleter.Delete(proj.FullName, permanent: true);

        Assert.False(Directory.Exists(proj.FullName));
    }

    [Fact]
    public void Permanent_TrimsTrailingSeparator()
    {
        var proj = Directory.CreateDirectory(Path.Combine(_dir, "Trail"));

        ProjectDeleter.Delete(proj.FullName + @"\", permanent: true);

        Assert.False(Directory.Exists(proj.FullName));
    }

    [Fact]
    public void Throws_WhenFolderMissing()
    {
        Assert.Throws<DirectoryNotFoundException>(() =>
            ProjectDeleter.Delete(Path.Combine(_dir, "nope"), permanent: true));
    }
}
