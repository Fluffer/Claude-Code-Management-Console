using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class SessionStalenessTests : IDisposable
{
    private readonly string _projectsDir = Directory.CreateTempSubdirectory("devprojects-stale-").FullName;
    public void Dispose() => Directory.Delete(_projectsDir, recursive: true);

    private string SessionDir()
    {
        var dir = Path.Combine(_projectsDir, "C--Dev-Proj"); // EncodeProjectPath(@"C:\Dev\Proj")
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Fact]
    public void NewestSessionUtc_ReturnsMostRecentMtime()
    {
        var dir = SessionDir();
        var a = Path.Combine(dir, "11111111-1111-1111-1111-111111111111.jsonl");
        var b = Path.Combine(dir, "22222222-2222-2222-2222-222222222222.jsonl");
        File.WriteAllText(a, "{}"); File.WriteAllText(b, "{}");
        var newest = DateTime.UtcNow.AddDays(-1);
        File.SetLastWriteTimeUtc(a, DateTime.UtcNow.AddDays(-10));
        File.SetLastWriteTimeUtc(b, newest);

        var got = new ClaudeSessionLister(_projectsDir).NewestSessionUtc(@"C:\Dev\Proj");
        Assert.NotNull(got);
        Assert.Equal(newest, got!.Value, TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void NewestSessionUtc_NullWhenNoSessions() =>
        Assert.Null(new ClaudeSessionLister(_projectsDir).NewestSessionUtc(@"C:\Dev\None"));

    [Theory]
    // newestAgeDays, isRunning, thresholdDays -> expected stale
    [InlineData(10, false, 7, true)]   // old and idle -> stale
    [InlineData(3,  false, 7, false)]  // recent -> not stale
    [InlineData(30, true,  7, false)]  // running -> never stale
    public void IsStale(int ageDays, bool running, int threshold, bool expected)
    {
        var now = new DateTime(2026, 6, 9, 12, 0, 0, DateTimeKind.Utc);
        var newest = now.AddDays(-ageDays);
        Assert.Equal(expected, SessionStaleness.IsStale(newest, now, running, threshold));
    }

    [Fact]
    public void IsStale_NullNewest_IsFalse() =>
        Assert.False(SessionStaleness.IsStale(null, DateTime.UtcNow, isRunning: false, thresholdDays: 7));
}
