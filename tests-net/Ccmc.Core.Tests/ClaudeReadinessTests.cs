using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ClaudeReadinessTests : IDisposable
{
    private readonly string _home = Directory.CreateTempSubdirectory("devprojects-ready-").FullName;
    public void Dispose() => Directory.Delete(_home, recursive: true);

    [Fact]
    public void ClaudeDirWritable_TrueWhenDirExistsAndWritable()
    {
        Directory.CreateDirectory(Path.Combine(_home, ".claude"));
        Assert.True(ClaudeReadiness.IsClaudeDirWritable(_home));
    }

    [Fact]
    public void ClaudeDirWritable_TrueWhenAbsentButHomeWritable() =>
        Assert.True(ClaudeReadiness.IsClaudeDirWritable(_home));

    [Fact]
    public void ClaudeDirWritable_FalseWhenHomeMissing() =>
        Assert.False(ClaudeReadiness.IsClaudeDirWritable(Path.Combine(_home, "does-not-exist")));
}
