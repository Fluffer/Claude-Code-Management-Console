using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class EnvFileEditorTests
{
    [Fact]
    public void Parse_KeysCommentsAndBlanks()
    {
        var text = "# header\nAPI_KEY=abc123\n\nMODE=dev # inline stays in value-ish\n";
        var entries = EnvFileEditor.Parse(text);
        Assert.Equal(2, entries.Count);
        Assert.Equal("API_KEY", entries[0].Key);
        Assert.Equal("abc123", entries[0].Value);
        Assert.Equal("MODE", entries[1].Key);
    }

    [Fact]
    public void SetKey_UpdatesExistingInPlace()
    {
        var text = "# header\nAPI_KEY=old\nMODE=dev\n";
        var updated = EnvFileEditor.SetKey(text, "API_KEY", "new");
        Assert.Equal("# header\nAPI_KEY=new\nMODE=dev\n", updated);
    }

    [Fact]
    public void SetKey_AppendsWhenAbsent()
    {
        var updated = EnvFileEditor.SetKey("A=1\n", "B", "2");
        Assert.Equal("A=1\nB=2\n", updated);
    }

    [Fact]
    public void RemoveKey_DropsLineKeepsRest()
    {
        var updated = EnvFileEditor.RemoveKey("# c\nA=1\nB=2\n", "A");
        Assert.Equal("# c\nB=2\n", updated);
    }
}
