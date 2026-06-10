using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public sealed class ConfigServiceTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-test-").FullName;
    private string ConfigPath => Path.Combine(_dir, "config.json");

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Load_CreatesDefaults_WhenFileMissing()
    {
        var service = new ConfigService(ConfigPath);
        var config = service.Load();

        Assert.True(File.Exists(ConfigPath));
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots);
        Assert.Null(config.DefaultRoot);
        Assert.Empty(config.Projects!);
    }

    [Fact]
    public void Load_RoundTripsSavedConfig()
    {
        var service = new ConfigService(ConfigPath);
        var config = service.Load();
        config.Roots = [@"C:\Somewhere"];
        config.DefaultRoot = @"C:\Somewhere";
        config.Projects![@"C:\Somewhere\Proj"] = new ProjectUsage
        {
            LastUsed = "2026-06-01T10:00:00.0000000Z",
            Flags = "--model opus",
        };
        service.Save(config);

        var reloaded = service.Load();
        Assert.Equal([@"C:\Somewhere"], reloaded.Roots);
        Assert.Equal("--model opus", reloaded.Projects![@"C:\Somewhere\Proj"].Flags);
        Assert.Equal("2026-06-01T10:00:00.0000000Z", reloaded.Projects[@"C:\Somewhere\Proj"].LastUsed);
    }

    [Fact]
    public void Load_QuarantinesCorruptFile_AndRegeneratesDefaults()
    {
        File.WriteAllText(ConfigPath, "{ not valid json !!!");
        var service = new ConfigService(ConfigPath);

        var config = service.Load();

        Assert.True(File.Exists(ConfigPath + ".bad"));
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots!);
        // Regenerated file must now parse.
        Assert.NotNull(service.Load());
    }

    [Fact]
    public void Load_ReadsLegacyPowerShellConfig()
    {
        // Exact shape the original PS launcher wrote (camelCase, nested object map).
        File.WriteAllText(ConfigPath, """
        {
          "roots": ["C:\\Dev\\Active"],
          "defaultRoot": "C:\\Dev\\Active",
          "ignore": ["notes"],
          "projects": {
            "C:\\Dev\\Active\\Hotel-Search": { "lastUsed": "2026-06-06T14:30:00Z", "flags": "--model opus" },
            "C:\\Dev\\Active\\Other": { "lastUsed": null, "flags": "" }
          }
        }
        """);
        var config = new ConfigService(ConfigPath).Load();

        Assert.Equal(["C:\\Dev\\Active"], config.Roots);
        Assert.Equal(["notes"], config.Ignore);
        Assert.Equal("--model opus", config.Projects![@"C:\Dev\Active\Hotel-Search"].Flags);
        Assert.Null(config.Projects[@"C:\Dev\Active\Other"].LastUsed);
    }

    [Fact]
    public void Load_BackfillsMissingProperties()
    {
        File.WriteAllText(ConfigPath, "{}");
        var config = new ConfigService(ConfigPath).Load();

        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots);
        Assert.NotNull(config.Ignore);
        Assert.NotNull(config.Projects);
    }

    [Fact]
    public void Save_LeavesNoTempFileBehind()
    {
        var service = new ConfigService(ConfigPath);
        service.Save(LauncherConfig.CreateDefault());

        Assert.True(File.Exists(ConfigPath));
        Assert.False(File.Exists(ConfigPath + ".tmp"));
    }

    [Fact]
    public void Load_ReturnsDefaultsWithoutOverwriting_WhenFileLocked()
    {
        var service = new ConfigService(ConfigPath);
        var original = service.Load();
        original.DefaultRoot = @"C:\Custom";
        service.Save(original);

        using (var _ = new FileStream(ConfigPath, FileMode.Open, FileAccess.Read, FileShare.None))
        {
            var fallback = service.Load();
            Assert.Null(fallback.DefaultRoot); // in-memory defaults (now empty)
        }

        // File on disk untouched after the lock is released.
        Assert.Equal(@"C:\Custom", service.Load().DefaultRoot);
    }

    [Fact]
    public void UpdateUsage_StampsUtcRoundTripTimestamp_AndSaves()
    {
        var service = new ConfigService(ConfigPath);
        var config = service.Load();

        service.UpdateUsage(config, @"C:\Dev\Active\Foo", "--verbose");

        var reloaded = service.Load();
        var usage = reloaded.Projects![@"C:\Dev\Active\Foo"];
        Assert.Equal("--verbose", usage.Flags);
        var parsed = DateTime.Parse(usage.LastUsed!, null,
            System.Globalization.DateTimeStyles.RoundtripKind);
        Assert.Equal(DateTimeKind.Utc, parsed.Kind);
        Assert.True(DateTime.UtcNow - parsed < TimeSpan.FromMinutes(1));
    }

    [Fact]
    public void UpdateFlags_DoesNotBumpLastUsed()
    {
        var service = new ConfigService(ConfigPath);
        var config = service.Load();
        config.Projects![@"C:\P"] = new ProjectUsage { LastUsed = "2026-01-01T00:00:00.0000000Z", Flags = "" };
        service.Save(config);

        service.UpdateFlags(config, @"C:\P", "--model opus");

        var reloaded = service.Load();
        Assert.Equal("2026-01-01T00:00:00.0000000Z", reloaded.Projects![@"C:\P"].LastUsed);
        Assert.Equal("--model opus", reloaded.Projects[@"C:\P"].Flags);
    }

    [Fact]
    public void ProjectKeys_AreCaseInsensitive()
    {
        var service = new ConfigService(ConfigPath);
        var config = service.Load();
        config.Projects![@"C:\Dev\Active\Foo"] = new ProjectUsage { Flags = "x" };
        service.Save(config);

        var reloaded = service.Load();
        Assert.True(reloaded.Projects!.ContainsKey(@"c:\dev\active\FOO"));
    }

    [Fact]
    public void CreateDefault_IsEmpty_NoPersonalPaths()
    {
        var config = LauncherConfig.CreateDefault();
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots);
        Assert.Null(config.DefaultRoot);
        Assert.NotNull(config.Ignore);
        Assert.Empty(config.Ignore);
        Assert.NotNull(config.Projects);
        Assert.Empty(config.Projects);
    }
}
