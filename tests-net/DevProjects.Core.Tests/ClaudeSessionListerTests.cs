using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class ClaudeSessionListerTests : IDisposable
{
    private readonly string _projectsDir = Directory.CreateTempSubdirectory("devprojects-list-").FullName;
    public void Dispose() => Directory.Delete(_projectsDir, recursive: true);

    private string MakeSessionDir()
    {
        var dir = Path.Combine(_projectsDir, "C--Dev-Proj"); // == ClaudeSessionDetector.EncodeProjectPath(@"C:\Dev\Proj")
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Fact]
    public void ListSessions_ReturnsIdMtimeAndFirstUserMessage_NewestFirst()
    {
        var dir = MakeSessionDir();
        var older = Path.Combine(dir, "11111111-1111-1111-1111-111111111111.jsonl");
        var newer = Path.Combine(dir, "22222222-2222-2222-2222-222222222222.jsonl");
        File.WriteAllText(older, """{"type":"user","message":{"role":"user","content":"first task here"}}""" + "\n{}\n");
        File.WriteAllText(newer, """{"type":"user","message":{"role":"user","content":[{"type":"text","text":"second task"}]}}""" + "\n");
        File.SetLastWriteTimeUtc(older, DateTime.UtcNow.AddHours(-2));
        File.SetLastWriteTimeUtc(newer, DateTime.UtcNow.AddMinutes(-5));

        var list = new ClaudeSessionLister(_projectsDir).ListSessions(@"C:\Dev\Proj");

        Assert.Equal(2, list.Count);
        Assert.Equal("22222222-2222-2222-2222-222222222222", list[0].SessionId);
        Assert.Equal("second task", list[0].FirstUserMessage);
        Assert.Equal("first task here", list[1].FirstUserMessage);
    }

    [Fact]
    public void ListSessions_NeverThrowsOnGarbageFirstLine()
    {
        var dir = MakeSessionDir();
        File.WriteAllText(Path.Combine(dir, "33333333-3333-3333-3333-333333333333.jsonl"), "not json at all\n");
        var list = new ClaudeSessionLister(_projectsDir).ListSessions(@"C:\Dev\Proj");
        Assert.Single(list);
        Assert.Equal("", list[0].FirstUserMessage);
    }

    [Fact]
    public void ListSessions_EmptyWhenNoSessionDir() =>
        Assert.Empty(new ClaudeSessionLister(_projectsDir).ListSessions(@"C:\Dev\Missing"));
}
