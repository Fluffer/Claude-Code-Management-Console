using System.Diagnostics;
using Ccmc.Core.Models;
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ProcessInspectorTests
{
    [Fact]
    public void ReadProcessParameters_OnSelf_ReturnsOwnCwdAndCommandLine()
    {
        var result = ProcessInspector.ReadProcessParameters(Environment.ProcessId);

        Assert.NotNull(result);
        Assert.Equal(
            Environment.CurrentDirectory.TrimEnd('\\'),
            result!.Value.CurrentDirectory.TrimEnd('\\'),
            ignoreCase: true);
        Assert.NotEmpty(result.Value.CommandLine);
    }

    [Fact]
    public void ReadProcessParameters_OnSpawnedChild_ReadsItsWorkingDirectory()
    {
        var workDir = Directory.CreateTempSubdirectory("devprojects-cwd-").FullName;
        var psi = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "cmd.exe"),
            Arguments = "/c pause",
            WorkingDirectory = workDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
        };
        using var child = Process.Start(psi)!;
        try
        {
            var result = ProcessInspector.ReadProcessParameters(child.Id);
            Assert.NotNull(result);
            Assert.Equal(workDir.TrimEnd('\\'), result!.Value.CurrentDirectory.TrimEnd('\\'), ignoreCase: true);
        }
        finally
        {
            child.Kill();
            child.WaitForExit(3000);
            Directory.Delete(workDir, recursive: true);
        }
    }

    [Fact]
    public void ReadProcessParameters_DeadProcess_ReturnsNull()
    {
        // PID 4 is SYSTEM (access denied) — must return null, never throw.
        var result = ProcessInspector.ReadProcessParameters(4);
        Assert.Null(result);
    }
}

public class RunningClaudeDetectorTests
{
    [Fact]
    public void GetRunningClaudeDirectories_DoesNotThrow()
    {
        var detector = new RunningClaudeDetector();
        var dirs = detector.GetRunningClaudeDirectories();
        Assert.NotNull(dirs);
    }

    [Fact]
    public void IsProjectRunning_MatchesExactAndSubdirectory()
    {
        var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            @"C:\Dev\Active\Proj",
            @"C:\Other\Deep\sub\folder",
        };

        Assert.True(RunningClaudeDetector.IsProjectRunning(dirs, @"C:\Dev\Active\Proj"));
        Assert.True(RunningClaudeDetector.IsProjectRunning(dirs, @"C:\dev\active\proj\")); // case + trailing slash
        Assert.True(RunningClaudeDetector.IsProjectRunning(dirs, @"C:\Other\Deep"));       // cwd under project
        Assert.False(RunningClaudeDetector.IsProjectRunning(dirs, @"C:\Dev\Active\Proj2")); // no partial-name match
    }

    [Fact]
    public void IsProjectRunning_ParentOfRunningDir_IsTrue()
    {
        var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"C:\Dev\Active\Proj" };
        Assert.True(RunningClaudeDetector.IsProjectRunning(dirs, @"C:\Dev\Active"));
        Assert.False(RunningClaudeDetector.IsProjectRunning(dirs, @"C:\Dev\Act"));
    }

    [Fact]
    public void SessionsForProject_MatchesExactAndSubdir()
    {
        var sessions = new[]
        {
            new RunningSession(100, "claude", @"C:\Dev\Active\Foo"),
            new RunningSession(101, "node",   @"C:\Dev\Active\Foo\sub"),
            new RunningSession(102, "claude", @"C:\Dev\Active\Bar"),
        };
        var hits = RunningClaudeDetector.SessionsForProject(sessions, @"C:\Dev\Active\Foo").ToList();
        Assert.Equal(new[] { 100, 101 }, hits.Select(s => s.Pid).OrderBy(x => x).ToArray());
    }

    [Fact]
    public void SessionsForProject_NoFalsePrefixMatch()
    {
        var sessions = new[] { new RunningSession(1, "claude", @"C:\Dev\Active\FooBar") };
        Assert.Empty(RunningClaudeDetector.SessionsForProject(sessions, @"C:\Dev\Active\Foo"));
    }
}
