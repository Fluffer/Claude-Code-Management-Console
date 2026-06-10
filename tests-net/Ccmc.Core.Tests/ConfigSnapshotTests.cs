using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ConfigSnapshotTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-snap-").FullName;
    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Write_CreatesTimestampedCopyInSnapshotsDir()
    {
        var config = Path.Combine(_dir, "config.json");
        File.WriteAllText(config, """{"roots":[]}""");

        var stamp = new DateTime(2026, 6, 9, 14, 30, 0, DateTimeKind.Utc);
        var snapshotPath = ConfigSnapshot.Write(config, stamp);

        Assert.True(File.Exists(snapshotPath));
        Assert.Equal("""{"roots":[]}""", File.ReadAllText(snapshotPath!));
        Assert.Contains("20260609-143000", snapshotPath);
        Assert.Equal(Path.Combine(_dir, "snapshots"), Path.GetDirectoryName(snapshotPath));
    }

    [Fact]
    public void Write_PrunesToMostRecentN()
    {
        var config = Path.Combine(_dir, "config.json");
        File.WriteAllText(config, "{}");
        for (var i = 0; i < 12; i++)
            ConfigSnapshot.Write(config, new DateTime(2026, 6, 9, 0, 0, 0, DateTimeKind.Utc).AddMinutes(i), keep: 10);

        var snaps = Directory.GetFiles(Path.Combine(_dir, "snapshots"), "config-*.json");
        Assert.Equal(10, snaps.Length); // pruned to the 10 newest
    }

    [Fact]
    public void Write_MissingSource_ReturnsNullNoThrow() =>
        Assert.Null(ConfigSnapshot.Write(Path.Combine(_dir, "absent.json"), new DateTime(2026, 1, 1)));
}
