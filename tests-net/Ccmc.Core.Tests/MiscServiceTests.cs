using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class RelativeTimeFormatterTests
{
    private static readonly DateTime Now = new(2026, 6, 6, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Null_ReturnsEmpty() => Assert.Equal("", RelativeTimeFormatter.Format(null, Now));

    [Theory]
    [InlineData(0.5, "just now")]
    [InlineData(5, "5m ago")]
    [InlineData(59, "59m ago")]
    public void Minutes(double minutesAgo, string expected) =>
        Assert.Equal(expected, RelativeTimeFormatter.Format(Now.AddMinutes(-minutesAgo), Now));

    [Theory]
    [InlineData(1, "1h ago")]
    [InlineData(23, "23h ago")]
    public void Hours(int hoursAgo, string expected) =>
        Assert.Equal(expected, RelativeTimeFormatter.Format(Now.AddHours(-hoursAgo), Now));

    [Theory]
    [InlineData(1, "1d ago")]
    [InlineData(6, "6d ago")]
    public void Days(int daysAgo, string expected) =>
        Assert.Equal(expected, RelativeTimeFormatter.Format(Now.AddDays(-daysAgo), Now));

    [Fact]
    public void OlderThanAWeek_ShowsDate()
    {
        var formatted = RelativeTimeFormatter.Format(Now.AddDays(-30), Now);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", formatted);
    }
}

public class ProjectNameValidatorTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("devprojects-name-").FullName;

    public void Dispose() => Directory.Delete(_root, recursive: true);

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Empty_IsRejected(string name) =>
        Assert.Contains("empty", ProjectNameValidator.GetError(name, _root)!);

    [Theory]
    [InlineData("bad<name")]
    [InlineData("bad|name")]
    [InlineData("bad?name")]
    [InlineData(@"bad\name")]
    [InlineData("bad:name")]
    public void InvalidCharacters_AreRejected(string name) =>
        Assert.Contains("invalid characters", ProjectNameValidator.GetError(name, _root)!);

    [Fact]
    public void Duplicate_IsRejected()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Existing"));
        Assert.Contains("already exists", ProjectNameValidator.GetError("Existing", _root)!);
    }

    [Fact]
    public void ValidName_ReturnsNull() =>
        Assert.Null(ProjectNameValidator.GetError("My-New Project 2", _root));

    [Fact]
    public void CreateProjectFolder_CreatesAndReturnsPath()
    {
        var path = ProjectNameValidator.CreateProjectFolder(_root, "Fresh");
        Assert.True(Directory.Exists(path));
        Assert.Equal(Path.Combine(_root, "Fresh"), path);
    }

    [Fact]
    public void CreateProjectFolder_ThrowsWhenRootMissing() =>
        Assert.Throws<DirectoryNotFoundException>(() =>
            ProjectNameValidator.CreateProjectFolder(Path.Combine(_root, "nope"), "X"));
}

public class ClaudeSessionDetectorTests : IDisposable
{
    private readonly string _projectsDir = Directory.CreateTempSubdirectory("devprojects-sess-").FullName;

    public void Dispose() => Directory.Delete(_projectsDir, recursive: true);

    [Theory]
    [InlineData(@"C:\Dev\Active\Claude Cli Management", "C--Dev-Active-Claude-Cli-Management")]
    [InlineData(@"C:\Dev\Active\AD.Build", "C--Dev-Active-AD-Build")]
    [InlineData(@"C:\a_b", "C--a-b")]
    public void EncodeProjectPath_ReplacesNonAlphanumericsWithDashes(string path, string expected) =>
        Assert.Equal(expected, ClaudeSessionDetector.EncodeProjectPath(path));

    [Fact]
    public void HasSession_TrueWhenTranscriptExists()
    {
        var dir = Directory.CreateDirectory(Path.Combine(_projectsDir, "C--Dev-Proj"));
        File.WriteAllText(Path.Combine(dir.FullName, "abc.jsonl"), "{}");

        var detector = new ClaudeSessionDetector(_projectsDir);
        Assert.True(detector.HasSession(@"C:\Dev\Proj"));
    }

    [Fact]
    public void GetLatestActivityUtc_ReturnsNewestTranscriptWrite()
    {
        var dir = Directory.CreateDirectory(Path.Combine(_projectsDir, "C--Dev-Proj"));
        var oldFile = Path.Combine(dir.FullName, "old.jsonl");
        var newFile = Path.Combine(dir.FullName, "new.jsonl");
        File.WriteAllText(oldFile, "{}");
        File.WriteAllText(newFile, "{}");
        File.SetLastWriteTimeUtc(oldFile, DateTime.UtcNow.AddHours(-3));
        var expected = DateTime.UtcNow.AddMinutes(-1);
        File.SetLastWriteTimeUtc(newFile, expected);

        var detector = new ClaudeSessionDetector(_projectsDir);
        var actual = detector.GetLatestActivityUtc(@"C:\Dev\Proj");

        Assert.NotNull(actual);
        Assert.True((actual!.Value - expected).Duration() < TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void GetLatestActivityUtc_NullWhenNoTranscripts()
    {
        Directory.CreateDirectory(Path.Combine(_projectsDir, "C--Dev-Empty"));
        var detector = new ClaudeSessionDetector(_projectsDir);
        Assert.Null(detector.GetLatestActivityUtc(@"C:\Dev\Empty"));
        Assert.Null(detector.GetLatestActivityUtc(@"C:\Dev\Missing"));
    }

    [Fact]
    public void HasSession_FalseWhenDirEmptyOrMissing()
    {
        Directory.CreateDirectory(Path.Combine(_projectsDir, "C--Dev-Empty"));
        var detector = new ClaudeSessionDetector(_projectsDir);

        Assert.False(detector.HasSession(@"C:\Dev\Empty"));   // dir exists, no transcripts
        Assert.False(detector.HasSession(@"C:\Dev\Missing")); // dir absent
    }
}

public class StateServiceTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-state-").FullName;
    private string StatePath => Path.Combine(_dir, "state.json");

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Load_ReturnsDefaults_WhenMissingOrCorrupt()
    {
        var path = Path.Combine(_dir, "state.json");
        var service = new StateService(path);
        Assert.Equal("System", service.Load().Theme);

        File.WriteAllText(path, "garbage{{");
        Assert.Equal("System", service.Load().Theme);
    }

    [Fact]
    public void SaveAndLoad_RoundTrips()
    {
        var service = new StateService(Path.Combine(_dir, "state.json"));
        service.Save(new AppState
        {
            Theme = "Dark",
            SortMode = "Name",
            Pinned = [@"C:\Dev\Active\Foo"],
            OnboardingDismissed = true,
        });

        var state = service.Load();
        Assert.Equal("Dark", state.Theme);
        Assert.Equal("Name", state.SortMode);
        Assert.Equal([@"C:\Dev\Active\Foo"], state.Pinned);
        Assert.True(state.OnboardingDismissed);
    }

    [Fact]
    public void Defaults_IncludeAccentAndFont()
    {
        var state = new AppState();
        Assert.Equal("Default", state.Accent);
        Assert.Equal("Segoe UI Variable", state.Font);
    }

    [Fact]
    public void RoundTrip_PreservesAccentAndFont()
    {
        var svc = new StateService(StatePath);
        svc.Save(new AppState { Theme = "Dracula", Accent = "Teal", Font = "Cascadia Code" });

        var loaded = new StateService(StatePath).Load();
        Assert.Equal("Dracula", loaded.Theme);
        Assert.Equal("Teal", loaded.Accent);
        Assert.Equal("Cascadia Code", loaded.Font);
    }

    [Fact]
    public void OldStateJson_WithoutNewFields_LoadsDefaults()
    {
        // A state.json written before the appearance port has no accent/font keys.
        Directory.CreateDirectory(_dir);
        File.WriteAllText(StatePath, """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true}""");

        var loaded = new StateService(StatePath).Load();
        Assert.Equal("Dark", loaded.Theme);
        Assert.Equal("Default", loaded.Accent);
        Assert.Equal("Segoe UI Variable", loaded.Font);
    }

    [Fact]
    public void Defaults_IncludeEmptyRecentLaunches() =>
        Assert.Empty(new AppState().RecentLaunches);

    [Fact]
    public void OldStateJson_WithoutRecentLaunches_LoadsEmptyList()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(StatePath, """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true}""");
        Assert.Empty(new StateService(StatePath).Load().RecentLaunches);
    }

    [Fact]
    public void Defaults_IncludeEmptyProfiles() =>
        Assert.Empty(new AppState().Profiles);

    [Fact]
    public void OldStateJson_WithoutProfiles_LoadsEmptyList()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(StatePath,
            """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true,"recentLaunches":[]}""");
        Assert.Empty(new StateService(StatePath).Load().Profiles);
    }

    [Fact]
    public void Profiles_RoundTripThroughSaveLoad()
    {
        Directory.CreateDirectory(_dir);
        var svc = new StateService(StatePath);
        var state = svc.Load();
        state.Profiles.Add(new LaunchProfile { Name = "Opus", Model = "opus", AllowedTools = ["Read"] });
        svc.Save(state);

        var reloaded = svc.Load();
        Assert.Single(reloaded.Profiles);
        Assert.Equal("Opus", reloaded.Profiles[0].Name);
        Assert.Equal("opus", reloaded.Profiles[0].Model);
        Assert.Equal(["Read"], reloaded.Profiles[0].AllowedTools);
    }

    [Fact]
    public void Defaults_IncludeEmptyGroups() =>
        Assert.Empty(new AppState().Groups);

    [Fact]
    public void OldStateJson_WithoutGroups_LoadsEmptyList()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(StatePath,
            """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true,"recentLaunches":[],"profiles":[]}""");
        Assert.Empty(new StateService(StatePath).Load().Groups);
    }

    [Fact]
    public void Groups_RoundTrip()
    {
        Directory.CreateDirectory(_dir);
        var svc = new StateService(StatePath);
        var state = svc.Load();
        state.Groups.Add(new LaunchGroup { Name = "Stack", ProjectPaths = [@"C:\a", @"C:\b"] });
        svc.Save(state);

        var reloaded = svc.Load();
        Assert.Single(reloaded.Groups);
        Assert.Equal("Stack", reloaded.Groups[0].Name);
        Assert.Equal([@"C:\a", @"C:\b"], reloaded.Groups[0].ProjectPaths);
    }

    [Fact]
    public void Defaults_IncludeEmptySavedFilters() =>
        Assert.Empty(new AppState().SavedFilters);

    [Fact]
    public void OldStateJson_WithoutSavedFilters_LoadsEmptyList()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(StatePath,
            """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true,"recentLaunches":[]}""");
        Assert.Empty(new StateService(StatePath).Load().SavedFilters);
    }

    [Fact]
    public void SavedFilters_RoundTrip()
    {
        Directory.CreateDirectory(_dir);
        var svc = new StateService(StatePath);
        var state = svc.Load();
        state.SavedFilters.Add(new SavedFilter { Name = "Active git", PathContains = "Active", RequireGit = true });
        svc.Save(state);

        var reloaded = svc.Load();
        Assert.Single(reloaded.SavedFilters);
        Assert.Equal("Active git", reloaded.SavedFilters[0].Name);
        Assert.True(reloaded.SavedFilters[0].RequireGit);
    }
}

public class GitInfoProviderTests : IDisposable
{
    private readonly string _repo = Directory.CreateTempSubdirectory("devprojects-git-").FullName;

    public void Dispose() => Directory.Delete(_repo, recursive: true);

    [Fact]
    public void ReadBranchFromHead_ParsesRef()
    {
        var gitDir = Directory.CreateDirectory(Path.Combine(_repo, ".git"));
        File.WriteAllText(Path.Combine(gitDir.FullName, "HEAD"), "ref: refs/heads/feature/x\n");

        Assert.Equal("feature/x", GitInfoProvider.ReadBranchFromHead(_repo));
    }

    [Fact]
    public void ReadBranchFromHead_DetachedHead_ReturnsShortHash()
    {
        var gitDir = Directory.CreateDirectory(Path.Combine(_repo, ".git"));
        File.WriteAllText(Path.Combine(gitDir.FullName, "HEAD"), "a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0\n");

        Assert.Equal("a1b2c3d", GitInfoProvider.ReadBranchFromHead(_repo));
    }

    [Fact]
    public void ReadBranchFromHead_NoRepo_ReturnsNull() =>
        Assert.Null(GitInfoProvider.ReadBranchFromHead(_repo));
}
