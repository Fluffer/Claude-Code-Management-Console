using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class SessionEndDetectorTests
{
    [Fact]
    public void Ended_ReturnsPathsThatLeftTheSet()
    {
        var prev = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\a", @"C:\b" };
        var now  = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\a" };
        Assert.Equal([@"C:\b"], SessionEndDetector.Ended(prev, now).ToArray());
    }

    [Fact]
    public void Ended_EmptyWhenNothingLeft()
    {
        var prev = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\a" };
        var now  = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\a", @"C:\b" };
        Assert.Empty(SessionEndDetector.Ended(prev, now));
    }

    [Fact]
    public void Ended_IsCaseInsensitive()
    {
        var prev = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\A" };
        var now  = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Assert.Equal([@"C:\A"], SessionEndDetector.Ended(prev, now).ToArray());
    }
}
