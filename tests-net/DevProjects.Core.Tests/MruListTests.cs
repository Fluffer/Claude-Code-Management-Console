using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class MruListTests
{
    [Fact]
    public void Add_MovesToFrontAndDedups()
    {
        var list = new List<string> { @"C:\b", @"C:\a" };
        var result = MruList.Add(list, @"C:\a", cap: 5);
        Assert.Equal(new[] { @"C:\a", @"C:\b" }, result.ToArray());
    }

    [Fact]
    public void Add_DedupsCaseInsensitively()
    {
        var result = MruList.Add(new List<string> { @"C:\A" }, @"c:\a", cap: 5);
        Assert.Single(result);
        Assert.Equal(@"c:\a", result[0]);
    }

    [Fact]
    public void Add_RespectsCap()
    {
        var list = new List<string> { @"C:\1", @"C:\2", @"C:\3" };
        var result = MruList.Add(list, @"C:\4", cap: 3);
        Assert.Equal(new[] { @"C:\4", @"C:\1", @"C:\2" }, result.ToArray());
    }
}
