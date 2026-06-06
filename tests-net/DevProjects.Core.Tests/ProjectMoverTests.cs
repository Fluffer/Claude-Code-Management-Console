using DevProjects.Core.Models;
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public sealed class ProjectMoverTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-move-").FullName;

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Rename_MovesFolderAndReturnsNewPath()
    {
        var original = Directory.CreateDirectory(Path.Combine(_dir, "Old")).FullName;
        File.WriteAllText(Path.Combine(original, "keep.txt"), "x");

        var renamed = ProjectMover.Rename(original, "New Name");

        Assert.Equal(Path.Combine(_dir, "New Name"), renamed);
        Assert.False(Directory.Exists(original));
        Assert.True(File.Exists(Path.Combine(renamed, "keep.txt")));
    }

    [Theory]
    [InlineData("")]
    [InlineData("bad|name")]
    public void Rename_RejectsInvalidNames(string newName)
    {
        var original = Directory.CreateDirectory(Path.Combine(_dir, "Old")).FullName;
        Assert.Throws<ArgumentException>(() => ProjectMover.Rename(original, newName));
        Assert.True(Directory.Exists(original)); // untouched
    }

    [Fact]
    public void Rename_RejectsExistingTarget()
    {
        var original = Directory.CreateDirectory(Path.Combine(_dir, "Old")).FullName;
        Directory.CreateDirectory(Path.Combine(_dir, "Taken"));
        Assert.Throws<ArgumentException>(() => ProjectMover.Rename(original, "Taken"));
    }

    [Fact]
    public void MoveToRoot_MovesFolderKeepingName()
    {
        var source = Directory.CreateDirectory(Path.Combine(_dir, "Active", "Proj")).FullName;
        var archive = Directory.CreateDirectory(Path.Combine(_dir, "Archive")).FullName;
        File.WriteAllText(Path.Combine(source, "keep.txt"), "x");

        var moved = ProjectMover.MoveToRoot(source, archive);

        Assert.Equal(Path.Combine(archive, "Proj"), moved);
        Assert.False(Directory.Exists(source));
        Assert.True(File.Exists(Path.Combine(moved, "keep.txt")));
    }

    [Fact]
    public void MoveToRoot_RejectsSameLocation()
    {
        var root = Directory.CreateDirectory(Path.Combine(_dir, "Active")).FullName;
        var source = Directory.CreateDirectory(Path.Combine(root, "Proj")).FullName;
        Assert.Throws<ArgumentException>(() => ProjectMover.MoveToRoot(source, root));
        Assert.True(Directory.Exists(source));
    }

    [Fact]
    public void MoveToRoot_RejectsExistingTargetName()
    {
        var source = Directory.CreateDirectory(Path.Combine(_dir, "Active", "Proj")).FullName;
        var archive = Directory.CreateDirectory(Path.Combine(_dir, "Archive")).FullName;
        Directory.CreateDirectory(Path.Combine(archive, "Proj"));
        Assert.Throws<ArgumentException>(() => ProjectMover.MoveToRoot(source, archive));
    }

    [Fact]
    public void Rename_CaseOnly_Succeeds()
    {
        var original = Directory.CreateDirectory(Path.Combine(_dir, "myproj")).FullName;
        File.WriteAllText(Path.Combine(original, "keep.txt"), "x");

        var renamed = ProjectMover.Rename(original, "MyProj");

        Assert.Equal(Path.Combine(_dir, "MyProj"), renamed);
        Assert.Equal("MyProj", new DirectoryInfo(renamed).Name); // actual on-disk casing
        Assert.True(File.Exists(Path.Combine(renamed, "keep.txt")));
        Assert.False(Directory.Exists(renamed + ".renaming-tmp"));
    }

    [Fact]
    public void MoveToRoot_RejectsTargetInsideProject()
    {
        var source = Directory.CreateDirectory(Path.Combine(_dir, "Active", "Proj")).FullName;
        var nested = Directory.CreateDirectory(Path.Combine(source, "inner")).FullName;
        Assert.Throws<ArgumentException>(() => ProjectMover.MoveToRoot(source, nested));
        Assert.True(Directory.Exists(source));
    }

    [Fact]
    public void MoveToRoot_RejectsMissingRoot()
    {
        var source = Directory.CreateDirectory(Path.Combine(_dir, "Active", "Proj")).FullName;
        Assert.Throws<DirectoryNotFoundException>(() =>
            ProjectMover.MoveToRoot(source, Path.Combine(_dir, "nope")));
    }
}

public sealed class MigrateProjectPathTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-mig-").FullName;

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void MigrateProjectPath_ReKeysUsageEntry_AndPersists()
    {
        var service = new ConfigService(Path.Combine(_dir, "config.json"));
        var config = service.Load();
        config.Projects![@"C:\Old\Proj"] = new ProjectUsage { LastUsed = "2026-01-01T00:00:00.0000000Z", Flags = "--verbose" };
        service.Save(config);

        service.MigrateProjectPath(config, @"C:\Old\Proj", @"C:\New\Proj");

        var reloaded = service.Load();
        Assert.False(reloaded.Projects!.ContainsKey(@"C:\Old\Proj"));
        Assert.Equal("--verbose", reloaded.Projects[@"C:\New\Proj"].Flags);
        Assert.Equal("2026-01-01T00:00:00.0000000Z", reloaded.Projects[@"C:\New\Proj"].LastUsed);
    }

    [Fact]
    public void MigrateProjectPath_NoEntry_IsNoOp()
    {
        var service = new ConfigService(Path.Combine(_dir, "config.json"));
        var config = service.Load();
        service.MigrateProjectPath(config, @"C:\Unknown", @"C:\New");
        Assert.Empty(service.Load().Projects!);
    }
}
