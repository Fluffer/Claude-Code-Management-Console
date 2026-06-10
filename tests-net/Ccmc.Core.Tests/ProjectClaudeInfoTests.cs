using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProjectClaudeInfoTests : IDisposable
{
    private readonly string _proj = Directory.CreateTempSubdirectory("devprojects-claudemd-").FullName;
    public void Dispose() => Directory.Delete(_proj, recursive: true);

    [Fact]
    public void HasClaudeMd_TrueWhenPresent()
    {
        File.WriteAllText(Path.Combine(_proj, "CLAUDE.md"), "# guidance");
        Assert.True(ProjectClaudeInfo.HasClaudeMd(_proj));
        Assert.Equal(Path.Combine(_proj, "CLAUDE.md"), ProjectClaudeInfo.ClaudeMdPath(_proj));
    }

    [Fact]
    public void HasClaudeMd_FalseWhenAbsent()
    {
        Assert.False(ProjectClaudeInfo.HasClaudeMd(_proj));
        Assert.Null(ProjectClaudeInfo.ClaudeMdPath(_proj));
    }
}
