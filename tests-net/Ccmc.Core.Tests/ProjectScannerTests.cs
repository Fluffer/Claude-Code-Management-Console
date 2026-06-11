using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public sealed class ProjectScannerTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("devprojects-scan-").FullName;

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private LauncherConfig MakeConfig() => new()
    {
        Roots = [_root],
        Ignore = [],
        Projects = new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase),
    };

    [Fact]
    public void Scan_FindsDirectSubfolders()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Alpha"));
        Directory.CreateDirectory(Path.Combine(_root, "Beta"));
        Directory.CreateDirectory(Path.Combine(_root, "Beta", "Nested")); // must NOT appear

        var projects = ProjectScanner.Scan(MakeConfig());

        Assert.Equal(["Alpha", "Beta"], projects.Select(p => p.Name).OrderBy(n => n).ToArray());
    }

    [Fact]
    public void Scan_SkipsDotAndHiddenFolders()
    {
        Directory.CreateDirectory(Path.Combine(_root, ".git"));
        var hidden = Directory.CreateDirectory(Path.Combine(_root, "Hidden"));
        hidden.Attributes |= FileAttributes.Hidden;
        Directory.CreateDirectory(Path.Combine(_root, "Visible"));

        var projects = ProjectScanner.Scan(MakeConfig());

        Assert.Equal(["Visible"], projects.Select(p => p.Name).ToArray());
    }

    [Fact]
    public void Scan_SkipsIgnoredNames_CaseInsensitively()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Notes"));
        Directory.CreateDirectory(Path.Combine(_root, "Keep"));
        var config = MakeConfig();
        config.Ignore = ["notes"];

        var projects = ProjectScanner.Scan(config);

        Assert.Equal(["Keep"], projects.Select(p => p.Name).ToArray());
    }

    [Fact]
    public void Scan_SkipsMissingRoots()
    {
        var config = MakeConfig();
        config.Roots = [Path.Combine(_root, "does-not-exist")];

        var projects = ProjectScanner.Scan(config);

        Assert.Empty(projects);
    }

    [Fact]
    public void Scan_AttachesLastUsedAndFlags_FromConfig_KeepingUtcKind()
    {
        var dir = Directory.CreateDirectory(Path.Combine(_root, "Tracked"));
        var config = MakeConfig();
        config.Projects![dir.FullName] = new ProjectUsage
        {
            LastUsed = "2026-06-06T14:30:00Z",
            Flags = "--model opus",
        };

        var project = Assert.Single(ProjectScanner.Scan(config));

        Assert.Equal("--model opus", project.Flags);
        Assert.NotNull(project.LastUsedUtc);
        Assert.Equal(DateTimeKind.Utc, project.LastUsedUtc!.Value.Kind);
        Assert.Equal(new DateTime(2026, 6, 6, 14, 30, 0, DateTimeKind.Utc), project.LastUsedUtc);
    }

    [Fact]
    public void Scan_HandlesNullLastUsed_AndUnknownProjects()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Fresh"));

        var project = Assert.Single(ProjectScanner.Scan(MakeConfig()));

        Assert.Null(project.LastUsedUtc);
        Assert.Equal("", project.Flags);
    }

    [Fact]
    public void Scan_FillsDescriptionFromReadme()
    {
        var proj = Directory.CreateDirectory(Path.Combine(_root, "Alpha"));
        File.WriteAllText(Path.Combine(proj.FullName, "README.md"), "# Alpha\nDoes alpha things.");

        var alpha = Assert.Single(ProjectScanner.Scan(MakeConfig()));

        Assert.Equal("Does alpha things.", alpha.Description);
    }

    [Fact]
    public void Scan_EmptyDescriptionWhenNoReadmeOrClaudeMd()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Bare"));

        var project = Assert.Single(ProjectScanner.Scan(MakeConfig()));

        Assert.Equal("", project.Description);
    }

    [Fact]
    public void Scan_SkipsHiddenPaths_CaseInsensitively()
    {
        var hide = Directory.CreateDirectory(Path.Combine(_root, "Secret"));
        Directory.CreateDirectory(Path.Combine(_root, "Keep"));
        var config = MakeConfig();
        config.Hidden = [hide.FullName.ToUpperInvariant()];

        var projects = ProjectScanner.Scan(config);

        Assert.Equal(["Keep"], projects.Select(p => p.Name).ToArray());
    }

    [Fact]
    public void Scan_HiddenDoesNotMatchByNameAlone()
    {
        // Hidden is path-based: a project with the same NAME under this root
        // must still appear when the hidden entry points elsewhere.
        Directory.CreateDirectory(Path.Combine(_root, "Tools"));
        var config = MakeConfig();
        config.Hidden = [@"C:\Somewhere\Else\Tools"];

        var projects = ProjectScanner.Scan(config);

        Assert.Equal(["Tools"], projects.Select(p => p.Name).ToArray());
    }
}
