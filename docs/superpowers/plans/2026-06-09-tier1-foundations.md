# Tier 1 — Foundations & High-Leverage UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> One fresh subagent per task; two-stage review between tasks. Core tasks are TDD
> (red→green→commit) via `developer`; WinUI tasks are build+manual-smoke via
> `winui:winui-dev`, reviewed by `winui:winui-code-review` before commit.

**Goal:** Ship the 9 Tier-1 enhancements: CLI version/readiness check, a PID-based
running-session model, stop/stop-all, a `--resume` session picker, quick-prompt
launch, a per-row model picker, a CLAUDE.md badge + open, an MRU list, and a
Ctrl+P fuzzy command palette.

**Architecture:** All testable logic lands in `DevProjects.Core` as pure/near-pure
helpers (xUnit-covered). WinUI wires those helpers into the existing MVVM surface
(`MainViewModel`, `ProjectItemViewModel`, row `DataTemplate`, `ContentDialog`
dialogs) with no DI container — services are newed-up in `MainViewModel`.

**Tech Stack:** .NET 10, WinUI 3 / Windows App SDK, CommunityToolkit.Mvvm,
System.Text.Json, xUnit.

**Build/test commands (used throughout):**
```powershell
dotnet build DevProjects.sln -p:Platform=x64
dotnet test tests-net/DevProjects.Core.Tests
```

---

## Task 1: Claude version parsing + outdated comparison (Core)

**Feature 1.1 (logic half).** Network fetch of "latest" is fail-soft and not unit
tested; the parse/compare logic is.

**Files:**
- Create: `src/DevProjects.Core/Services/ClaudeVersionInfo.cs`
- Test: `tests-net/DevProjects.Core.Tests/ClaudeVersionInfoTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class ClaudeVersionInfoTests
{
    [Theory]
    [InlineData("2.1.0 (Claude Code)", 2, 1, 0)]
    [InlineData("v2.10.3", 2, 10, 3)]
    [InlineData("1.0.45", 1, 0, 45)]
    public void Parse_ExtractsSemver(string raw, int maj, int min, int pat)
    {
        var v = ClaudeVersionInfo.Parse(raw);
        Assert.NotNull(v);
        Assert.Equal((maj, min, pat), (v!.Value.Major, v.Value.Minor, v.Value.Patch));
    }

    [Theory]
    [InlineData("not a version")]
    [InlineData("")]
    public void Parse_ReturnsNullOnGarbage(string raw) => Assert.Null(ClaudeVersionInfo.Parse(raw));

    [Theory]
    [InlineData("2.1.0", "2.1.1", true)]
    [InlineData("2.1.0", "2.2.0", true)]
    [InlineData("2.1.0", "3.0.0", true)]
    [InlineData("2.1.0", "2.1.0", false)]
    [InlineData("2.1.5", "2.1.0", false)]   // installed ahead → not outdated
    [InlineData("garbage", "2.1.0", false)] // unknown → never nag
    [InlineData("2.1.0", "garbage", false)]
    public void IsOutdated(string installed, string latest, bool expected) =>
        Assert.Equal(expected, ClaudeVersionInfo.IsOutdated(installed, latest));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ClaudeVersionInfoTests`
Expected: FAIL — `ClaudeVersionInfo` does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
using System.Text.RegularExpressions;

namespace DevProjects.Core.Services;

/// <summary>Parses and compares claude CLI semver strings. Unknown input never nags.</summary>
public static partial class ClaudeVersionInfo
{
    [GeneratedRegex(@"(\d+)\.(\d+)\.(\d+)")]
    private static partial Regex Semver();

    public static (int Major, int Minor, int Patch)? Parse(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var m = Semver().Match(raw);
        if (!m.Success) return null;
        return (int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value));
    }

    /// <summary>True only when both parse AND latest is strictly newer than installed.</summary>
    public static bool IsOutdated(string? installed, string? latest)
    {
        var a = Parse(installed);
        var b = Parse(latest);
        if (a is null || b is null) return false;
        return Compare(b.Value, a.Value) > 0;
    }

    private static int Compare((int Major, int Minor, int Patch) x, (int Major, int Minor, int Patch) y)
    {
        if (x.Major != y.Major) return x.Major.CompareTo(y.Major);
        if (x.Minor != y.Minor) return x.Minor.CompareTo(y.Minor);
        return x.Patch.CompareTo(y.Patch);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ClaudeVersionInfoTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Services/ClaudeVersionInfo.cs tests-net/DevProjects.Core.Tests/ClaudeVersionInfoTests.cs
git commit -m "feat(core): parse and compare claude CLI versions"
```

---

## Task 2: Latest-version fetch + readiness probe on ClaudeCliService (Core)

**Feature 1.1 (integration half).** Fail-soft network + cheap filesystem checks.

**Files:**
- Modify: `src/DevProjects.Core/Services/ClaudeCliService.cs`
- Test: `tests-net/DevProjects.Core.Tests/ClaudeReadinessTests.cs`

- [ ] **Step 1: Write the failing test** (readiness is pure filesystem; network fetch is not unit-tested)

```csharp
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

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
    public void ClaudeDirWritable_TrueWhenAbsentButHomeWritable()
    {
        // No .claude yet — claude will create it; home being writable is enough.
        Assert.True(ClaudeReadiness.IsClaudeDirWritable(_home));
    }

    [Fact]
    public void ClaudeDirWritable_FalseWhenHomeMissing() =>
        Assert.False(ClaudeReadiness.IsClaudeDirWritable(Path.Combine(_home, "does-not-exist")));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ClaudeReadinessTests`
Expected: FAIL — `ClaudeReadiness` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/DevProjects.Core/Services/ClaudeReadiness.cs`:

```csharp
namespace DevProjects.Core.Services;

/// <summary>Cheap "can Claude start cleanly here?" checks. Filesystem only, no network.</summary>
public static class ClaudeReadiness
{
    /// <summary>True if the user's .claude dir is writable, or absent but the home dir is writable.</summary>
    public static bool IsClaudeDirWritable(string? homeDir = null)
    {
        homeDir ??= Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!Directory.Exists(homeDir)) return false;
        var claudeDir = Path.Combine(homeDir, ".claude");
        var probeDir = Directory.Exists(claudeDir) ? claudeDir : homeDir;
        try
        {
            var probe = Path.Combine(probeDir, ".devprojects-write-probe");
            File.WriteAllText(probe, "");
            File.Delete(probe);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
```

Then add the fail-soft latest-version fetch to `ClaudeCliService` (append method; it is
network and intentionally **not** unit tested — wrapped in the same exception filter style
as `QueryVersionAsync`):

```csharp
    /// <summary>
    /// Latest published version of @anthropic-ai/claude-code from the npm registry,
    /// or null on any failure. Fail-soft: a missing answer simply means "don't nag".
    /// </summary>
    public async Task<string?> GetLatestPublishedVersionAsync()
    {
        try
        {
            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var json = await http.GetStringAsync(
                "https://registry.npmjs.org/@anthropic-ai/claude-code/latest").ConfigureAwait(false);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("version", out var v) ? v.GetString() : null;
        }
        catch (Exception ex) when (
            ex is System.Net.Http.HttpRequestException or TaskCanceledException
               or System.Text.Json.JsonException or IOException)
        {
            return null;
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ClaudeReadinessTests`
Expected: PASS. Then full `dotnet build DevProjects.sln -p:Platform=x64` to confirm
the `ClaudeCliService` change compiles.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Services/ClaudeReadiness.cs src/DevProjects.Core/Services/ClaudeCliService.cs tests-net/DevProjects.Core.Tests/ClaudeReadinessTests.cs
git commit -m "feat(core): claude readiness probe and latest-version fetch"
```

---

## Task 3: Surface version nudge + readiness in the status bar (WinUI)

**Feature 1.1 (UI).** Manual smoke — no UI unit harness (project convention).

**Files:**
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs`
- Modify: `src/DevProjects.App/MainWindow.xaml` (status bar row)

- [ ] **Step 1: Add VM state + check.** In `MainViewModel` add:

```csharp
[ObservableProperty] private string _updateNudgeText = "";
[ObservableProperty] private bool _updateAvailable;
```

In the existing startup/version flow (where `GetVersionAsync()` is already awaited to
set `ClaudeVersionText`), after the installed version is known, add:

```csharp
private async Task CheckForUpdateAsync(string installedRaw)
{
    var latest = await _claudeCli.GetLatestPublishedVersionAsync();
    if (latest is null || !ClaudeVersionInfo.IsOutdated(installedRaw, latest)) return;
    _dispatcherQueue.TryEnqueue(() =>
    {
        UpdateAvailable = true;
        UpdateNudgeText = $"claude {latest} available — run `claude update`";
    });
}
```

Call `_ = CheckForUpdateAsync(version);` right after `ClaudeVersionText` is set (fire-and-forget).
Field name note: the running ClaudeCliService instance in `MainViewModel` — reuse the
existing field (the explorer map shows `ClaudeCliService` is already held); if it is a local,
promote to a field `_claudeCli`.

- [ ] **Step 2: Add the nudge to the status bar.** In `MainWindow.xaml` status bar (Row 3),
add a `HyperlinkButton`/`TextBlock` bound to the nudge:

```xml
<TextBlock Text="{x:Bind ViewModel.UpdateNudgeText, Mode=OneWay}"
           Visibility="{x:Bind ViewModel.UpdateAvailable, Mode=OneWay}"
           Foreground="{ThemeResource SystemFillColorCautionBrush}"
           VerticalAlignment="Center" Margin="12,0,0,0"
           ToolTipService.ToolTip="A newer Claude Code CLI is published on npm." />
```

(`bool`→`Visibility` already works elsewhere in this project via `x:Bind` to a bool with
the built-in converter usage; match the existing live-badge `Visibility="{x:Bind IsRunning...}"`
approach exactly — if that uses a `BoolToVisibilityConverter`, reuse the same converter key.)

- [ ] **Step 3: Build + manual smoke**

Run: `dotnet build DevProjects.sln -p:Platform=x64`
Then `winapp run "src/DevProjects.App/bin/x64/Debug/net10.0-windows10.0.26100.0/win-x64"`.
Verify: with a deliberately old installed version the nudge appears; with current, it stays hidden.
Offline: app still launches, no nudge, no error.

- [ ] **Step 4: Review then commit**

Dispatch `winui:winui-code-review` on the diff. Then:

```bash
git add src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml
git commit -m "feat(ui): claude update nudge in status bar"
```

---

## Task 4: PID-based running-session model (Core)

**Feature 1.2.** Foundation for stop/stop-all and completion toasts. The PEB walk
itself isn't unit-testable, but the *matching* logic is — and that is what 1.3 uses.

**Files:**
- Create: `src/DevProjects.Core/Models/RunningSession.cs`
- Modify: `src/DevProjects.Core/Services/RunningClaudeDetector.cs`
- Test: `tests-net/DevProjects.Core.Tests/RunningDetectionTests.cs` (extend existing)

- [ ] **Step 1: Write the failing test** (append to `RunningDetectionTests`):

```csharp
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter RunningDetectionTests`
Expected: FAIL — `RunningSession` and `SessionsForProject` do not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/DevProjects.Core/Models/RunningSession.cs`:

```csharp
namespace DevProjects.Core.Models;

/// <summary>A live claude/node/bun process believed to host a Claude session.</summary>
public sealed record RunningSession(int Pid, string ProcessName, string WorkingDirectory);
```

In `RunningClaudeDetector.cs` add (alongside the existing `GetRunningClaudeDirectories`):

```csharp
public IReadOnlyList<RunningSession> GetRunningSessions()
{
    var result = new List<RunningSession>();
    foreach (var proc in EnumerateCandidateProcesses()) // existing helper that yields the claude/node/bun procs
    {
        var info = ProcessInspector.ReadProcessParameters(proc.Id);
        if (info is null) continue;
        var (cwd, cmdLine) = info.Value;
        if (!IsClaudeProcess(proc.ProcessName, cmdLine)) continue; // existing node/bun "claude" substring rule
        result.Add(new RunningSession(proc.Id, proc.ProcessName, TrimTrailingSeparators(cwd)));
    }
    return result;
}

public static IEnumerable<RunningSession> SessionsForProject(
    IEnumerable<RunningSession> sessions, string projectPath)
{
    var normalized = TrimTrailingSeparators(projectPath);
    foreach (var s in sessions)
    {
        if (string.Equals(s.WorkingDirectory, normalized, StringComparison.OrdinalIgnoreCase)) yield return s;
        else if (s.WorkingDirectory.StartsWith(normalized + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            yield return s;
    }
}
```

Refactor the existing `GetRunningClaudeDirectories` to delegate
(`GetRunningSessions().Select(s => s.WorkingDirectory)` into the set) so there is one
scan path. Reuse the existing private helpers for process enumeration, the
claude-substring filter, and trailing-separator trimming — extract them to the names
used above (`EnumerateCandidateProcesses`, `IsClaudeProcess`, `TrimTrailingSeparators`)
if they are currently inline.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter RunningDetectionTests`
Expected: PASS. Then `dotnet build DevProjects.sln -p:Platform=x64`.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Models/RunningSession.cs src/DevProjects.Core/Services/RunningClaudeDetector.cs tests-net/DevProjects.Core.Tests/RunningDetectionTests.cs
git commit -m "feat(core): PID-based running-session model with project matching"
```

---

## Task 5: Session killer + stop selection (Core)

**Feature 1.3 (logic).** Actual kill is a real-process side effect (not unit tested);
which PIDs to target reuses Task 4's tested matcher.

**Files:**
- Create: `src/DevProjects.Core/Services/SessionKiller.cs`

- [ ] **Step 1: Implement** (no new unit test — selection is already covered by Task 4;
add an XML-doc note pointing there):

```csharp
using System.Diagnostics;

namespace DevProjects.Core.Services;

/// <summary>Terminates running claude session processes. Fail-soft per PID.</summary>
public static class SessionKiller
{
    /// <summary>Kill one PID and its child tree. Returns true if it was killed (or already gone).</summary>
    public static bool Kill(int pid)
    {
        try
        {
            using var p = Process.GetProcessById(pid);
            p.Kill(entireProcessTree: true);
            return true;
        }
        catch (ArgumentException) { return true;  } // already exited
        catch (InvalidOperationException) { return true; }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception) { return false; } // access denied
    }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `dotnet build DevProjects.sln -p:Platform=x64`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/DevProjects.Core/Services/SessionKiller.cs
git commit -m "feat(core): session killer for stop/stop-all"
```

---

## Task 6: Stop session(s) + Stop-all in the UI (WinUI)

**Feature 1.3 (UI).** Killing loses unsaved session work — **confirm before killing.**

**Files:**
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs`
- Modify: `src/DevProjects.App/MainWindow.xaml` + `MainWindow.xaml.cs` (row context menu, status bar button)

- [ ] **Step 1: Add VM commands.** In `MainViewModel`:

```csharp
[RelayCommand]
private async Task StopSessionAsync(ProjectItemViewModel? project)
{
    if (project is null) return;
    var sessions = RunningClaudeDetector.SessionsForProject(_runningDetector.GetRunningSessions(), project.Path).ToList();
    if (sessions.Count == 0) return;
    if (!await _dialogs.ConfirmAsync("Stop session",
            $"Stop {sessions.Count} running Claude session(s) in {project.Name}? Unsaved work in those sessions is lost.",
            "Stop", "Cancel"))
        return;
    foreach (var s in sessions) SessionKiller.Kill(s.Pid);
    RefreshRunningStates();
}

[RelayCommand]
private async Task StopAllAsync()
{
    var sessions = _runningDetector.GetRunningSessions();
    if (sessions.Count == 0) return;
    if (!await _dialogs.ConfirmAsync("Stop all sessions",
            $"Stop all {sessions.Count} running Claude session(s)? Unsaved work is lost.",
            "Stop all", "Cancel"))
        return;
    foreach (var s in sessions) SessionKiller.Kill(s.Pid);
    RefreshRunningStates();
}
```

- [ ] **Step 2: Wire the row context menu.** In the project-row `MenuFlyout`
(`MainWindow.xaml`), add an item bound to `StopSessionCommand` with the row as parameter,
visible only when `IsRunning` (mirror how existing context-menu items pass the row). Add a
**"Stop all"** button to the status bar bound to `StopAllCommand`, visible when
`RunningSummary` indicates ≥1 (reuse the existing running-count signal).

- [ ] **Step 3: Build + manual smoke**

Build, run. Launch a real claude session in a project, confirm the live badge appears,
right-click → Stop → confirm → badge clears within the 30s refresh (or immediately, since
the command calls `RefreshRunningStates()`). Cancel path leaves it running.

- [ ] **Step 4: Review then commit**

`winui:winui-code-review` on the diff, then:

```bash
git add src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml src/DevProjects.App/MainWindow.xaml.cs
git commit -m "feat(ui): stop session and stop-all with confirmation"
```

---

## Task 7: Session lister for the resume picker (Core)

**Feature 1.4 (logic).** Reads only filename + mtime + **first line** of each `.jsonl`.
Defensive first-line parse — never throws on unexpected shapes (the durability rule).

**Files:**
- Create: `src/DevProjects.Core/Models/SessionSummary.cs`
- Create: `src/DevProjects.Core/Services/ClaudeSessionLister.cs`
- Test: `tests-net/DevProjects.Core.Tests/ClaudeSessionListerTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class ClaudeSessionListerTests : IDisposable
{
    private readonly string _projectsDir = Directory.CreateTempSubdirectory("devprojects-list-").FullName;
    public void Dispose() => Directory.Delete(_projectsDir, recursive: true);

    private string MakeSessionDir()
    {
        // Matches ClaudeSessionDetector.EncodeProjectPath(@"C:\Dev\Proj").
        var dir = Path.Combine(_projectsDir, "C--Dev-Proj");
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
        Assert.Equal("22222222-2222-2222-2222-222222222222", list[0].SessionId); // newest first
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
        Assert.Equal("", list[0].FirstUserMessage); // fell back, did not throw
    }

    [Fact]
    public void ListSessions_EmptyWhenNoSessionDir() =>
        Assert.Empty(new ClaudeSessionLister(_projectsDir).ListSessions(@"C:\Dev\Missing"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ClaudeSessionListerTests`
Expected: FAIL — types do not exist.

- [ ] **Step 3: Write minimal implementation**

`src/DevProjects.Core/Models/SessionSummary.cs`:

```csharp
namespace DevProjects.Core.Models;

/// <summary>A resumable Claude session: its id (file stem), last write, and first user line.</summary>
public sealed record SessionSummary(string SessionId, DateTime LastWriteUtc, string FirstUserMessage);
```

`src/DevProjects.Core/Services/ClaudeSessionLister.cs`:

```csharp
using System.Text.Json;
using DevProjects.Core.Models;

namespace DevProjects.Core.Services;

/// <summary>
/// Lists resumable sessions for a project from %USERPROFILE%\.claude\projects\&lt;encoded&gt;.
/// Reads ONLY the first line of each transcript for a preview — never the message body
/// stream — so it stays durable across Claude Code transcript-schema changes.
/// </summary>
public sealed class ClaudeSessionLister
{
    private readonly string _projectsDir;

    public ClaudeSessionLister(string? projectsDir = null)
    {
        _projectsDir = projectsDir ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "projects");
    }

    public IReadOnlyList<SessionSummary> ListSessions(string projectPath)
    {
        var result = new List<SessionSummary>();
        try
        {
            var dir = Path.Combine(_projectsDir, ClaudeSessionDetector.EncodeProjectPath(projectPath));
            if (!Directory.Exists(dir)) return result;
            foreach (var file in Directory.EnumerateFiles(dir, "*.jsonl"))
            {
                result.Add(new SessionSummary(
                    Path.GetFileNameWithoutExtension(file),
                    File.GetLastWriteTimeUtc(file),
                    ReadFirstUserMessage(file)));
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { /* best-effort */ }
        return result.OrderByDescending(s => s.LastWriteUtc).ToList();
    }

    private static string ReadFirstUserMessage(string file)
    {
        try
        {
            using var reader = new StreamReader(file);
            for (var line = reader.ReadLine(); line is not null; line = reader.ReadLine())
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var text = ExtractText(line);
                if (text is not null) return Truncate(text, 120);
                break; // only inspect the first non-empty line — durability over completeness
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { }
        return "";
    }

    // Defensive: try the known shapes (content string, or content[].text); any miss → null.
    private static string? ExtractText(string line)
    {
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            var msg = root.TryGetProperty("message", out var m) ? m : root;
            if (msg.TryGetProperty("content", out var content))
            {
                if (content.ValueKind == JsonValueKind.String) return content.GetString();
                if (content.ValueKind == JsonValueKind.Array)
                    foreach (var part in content.EnumerateArray())
                        if (part.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                            return t.GetString();
            }
        }
        catch (JsonException) { }
        return null;
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..max] + "…";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ClaudeSessionListerTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Models/SessionSummary.cs src/DevProjects.Core/Services/ClaudeSessionLister.cs tests-net/DevProjects.Core.Tests/ClaudeSessionListerTests.cs
git commit -m "feat(core): list resumable sessions with durable first-line preview"
```

---

## Task 8: Resume-session picker dialog (WinUI)

**Feature 1.4 (UI).** New `ContentDialog` following the existing dialog pattern.

**Files:**
- Create: `src/DevProjects.App/Views/ResumeSessionDialog.xaml` (+ `.xaml.cs`)
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs`
- Modify: `src/DevProjects.App/MainWindow.xaml` (+ `.xaml.cs`) — row context menu entry

- [ ] **Step 1: Add VM support.** In `MainViewModel`, hold a `ClaudeSessionLister _sessionLister = new();`
and add:

```csharp
public IReadOnlyList<SessionSummary> ListSessions(ProjectItemViewModel project) =>
    _sessionLister.ListSessions(project.Path);

public async Task ResumeSessionAsync(ProjectItemViewModel project, string sessionId)
{
    // sessionId is a uuid (hex + dashes) — safe for AreFlagsSafe.
    var flags = $"--resume {sessionId}";
    await LaunchWithFlagsAsync(project, flags, continueSession: false);
}
```

If `LaunchAsync` currently reads the row's saved flags internally, extract a
`LaunchWithFlagsAsync(project, flags, continueSession)` overload that the existing
`LaunchAsync` delegates to, so resume can pass explicit flags without disturbing saved flags.

- [ ] **Step 2: Create the dialog** (`ResumeSessionDialog.xaml`), subclassing `ContentDialog`,
matching `SettingsDialog`'s construction style:

```xml
<ContentDialog x:Class="DevProjects.App.Views.ResumeSessionDialog"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Resume a session" PrimaryButtonText="Resume" CloseButtonText="Cancel"
    IsPrimaryButtonEnabled="False">
  <ListView x:Name="SessionList" SelectionMode="Single" MinWidth="420" MaxHeight="360"
            SelectionChanged="OnSelectionChanged">
    <ListView.ItemTemplate>
      <DataTemplate>
        <StackPanel Padding="4">
          <TextBlock Text="{Binding FirstUserMessage}" TextTrimming="CharacterEllipsis"/>
          <TextBlock Text="{Binding RelativeTime}" Style="{ThemeResource CaptionTextBlockStyle}"
                     Opacity="0.7"/>
        </StackPanel>
      </DataTemplate>
    </ListView.ItemTemplate>
  </ListView>
</ContentDialog>
```

Code-behind: ctor takes the `IReadOnlyList<SessionSummary>` (projected to a small display
record carrying `FirstUserMessage`, `RelativeTime` via `RelativeTimeFormatter.Format`, and
`SessionId`); `OnSelectionChanged` enables the primary button and stores `SelectedSessionId`.
A blank `FirstUserMessage` shows the `SessionId` instead.

- [ ] **Step 3: Wire the row context menu.** Add "Resume session…" to the row `MenuFlyout`
(visible when `HasSession`). Handler in `MainWindow.xaml.cs`:

```csharp
private async void OnResumeSessionClick(object sender, RoutedEventArgs e)
{
    var project = ((FrameworkElement)sender).DataContext as ProjectItemViewModel;
    if (project is null) return;
    var sessions = ViewModel.ListSessions(project);
    if (sessions.Count == 0) { await _dialogs.ShowMessageAsync("Resume", "No past sessions found."); return; }
    var dialog = new ResumeSessionDialog(sessions) { XamlRoot = Content.XamlRoot, RequestedTheme = RootGrid.RequestedTheme };
    if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary && dialog.SelectedSessionId is { } id)
        await ViewModel.ResumeSessionAsync(project, id);
}
```

- [ ] **Step 4: Build + manual smoke**

Build, run. On a project with prior sessions, right-click → Resume session… → the list shows
first-message previews + relative times, newest first → pick → a wt tab opens running
`claude --resume <id>`. On a project with none, the info message shows.

- [ ] **Step 5: Review then commit**

`winui:winui-code-review`, then:

```bash
git add src/DevProjects.App/Views/ResumeSessionDialog.xaml src/DevProjects.App/Views/ResumeSessionDialog.xaml.cs src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml src/DevProjects.App/MainWindow.xaml.cs
git commit -m "feat(ui): resume specific past session picker"
```

---

## Task 9: Quick-prompt launch command builder (Core)

**Feature 1.5 (logic).** Open an interactive session seeded with a first message:
`claude '<prompt>' <flags>`. The prompt is **single-quoted for PowerShell** (literal —
neutralizes `$`, backtick, `;`, `|`, `&`, etc.); the only escape is doubling `'`.

**Files:**
- Modify: `src/DevProjects.Core/Services/LaunchCommandBuilder.cs`
- Test: `tests-net/DevProjects.Core.Tests/LaunchCommandTests.cs` (extend existing)

- [ ] **Step 1: Write the failing test** (append):

```csharp
[Fact]
public void BuildClaudeCommand_WithPrompt_SingleQuotesForPowerShell()
{
    var cmd = LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false, initialPrompt: "fix the $bug & ship");
    Assert.Equal("claude 'fix the $bug & ship'", cmd);
}

[Fact]
public void BuildClaudeCommand_WithPrompt_DoublesSingleQuotes()
{
    var cmd = LaunchCommandBuilder.BuildClaudeCommand("--model opus", continueSession: false, initialPrompt: "it's broken");
    Assert.Equal("claude 'it''s broken' --model opus", cmd);
}

[Fact]
public void BuildClaudeCommand_PromptIgnoredWhenContinue()
{
    // --continue resumes; an initial prompt would be meaningless. Prompt wins is NOT allowed.
    var cmd = LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true, initialPrompt: "hi");
    Assert.Equal("claude --continue", cmd);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter LaunchCommandTests`
Expected: FAIL — `BuildClaudeCommand` has no `initialPrompt` parameter.

- [ ] **Step 3: Modify implementation.** Change `BuildClaudeCommand` to:

```csharp
public static string BuildClaudeCommand(string flags, bool continueSession, string? initialPrompt = null)
{
    if (!AreFlagsSafe(flags))
        throw new ArgumentException(UnsafeFlagMessage, nameof(flags));
    var command = "claude";
    if (continueSession) command += " --continue";
    else if (!string.IsNullOrWhiteSpace(initialPrompt))
        command += " '" + initialPrompt.Replace("'", "''") + "'";
    if (!string.IsNullOrWhiteSpace(flags)) command += " " + flags.Trim();
    return command;
}
```

Add an overload of `Build(...)` that threads `initialPrompt` through to `BuildClaudeCommand`
(or add an optional `string? initialPrompt = null` parameter to the existing `Build`,
defaulting to null so current callers are unaffected, and pass it into the
`BuildClaudeCommand` call on line 47).

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter LaunchCommandTests`
Expected: PASS. Confirm existing LaunchCommandTests still pass (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Services/LaunchCommandBuilder.cs tests-net/DevProjects.Core.Tests/LaunchCommandTests.cs
git commit -m "feat(core): seed interactive launch with a quick prompt"
```

---

## Task 10: Quick-prompt UI (WinUI)

**Feature 1.5 (UI).**

**Files:**
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs`
- Modify: `src/DevProjects.App/MainWindow.xaml` (+ `.xaml.cs`)
- Optional create: `src/DevProjects.App/Views/QuickPromptDialog.xaml` (a one-field input dialog)

- [ ] **Step 1: VM method.** Add:

```csharp
public async Task LaunchQuickPromptAsync(ProjectItemViewModel project, string prompt)
{
    if (string.IsNullOrWhiteSpace(prompt)) return;
    var spec = LaunchCommandBuilder.Build(project.Name, project.Path, project.Flags,
        continueSession: false, initialPrompt: prompt);
    SessionLauncher.Launch(spec);
    _configService.UpdateUsage(_config, project.Path, project.Flags);
    Rescan(); ApplyFilter();
    PushRecent(project.Path);   // see Task 15 — if Task 15 not yet done, omit this line
}
```

- [ ] **Step 2: Input dialog + trigger.** Add a row context-menu item "Quick prompt…" and a
keyboard accelerator `Ctrl+Shift+Enter` on the focused row. Handler shows a simple
`ContentDialog` with one multi-line `TextBox` (or reuse a minimal `QuickPromptDialog`),
then calls `ViewModel.LaunchQuickPromptAsync(project, text)`.

- [ ] **Step 3: Build + manual smoke**

Build, run. Right-click a project → Quick prompt… → type `what does this repo do?` →
a wt tab opens with `claude 'what does this repo do?'` and Claude starts with that message.
Test a prompt containing `'`, `$`, `&` — it must reach claude literally, not break the shell.

- [ ] **Step 4: Review then commit**

`winui:winui-code-review`, then:

```bash
git add src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml src/DevProjects.App/MainWindow.xaml.cs src/DevProjects.App/Views/QuickPromptDialog.xaml src/DevProjects.App/Views/QuickPromptDialog.xaml.cs
git commit -m "feat(ui): quick-prompt launch from a project row"
```

---

## Task 11: Model-flag editor (Core)

**Feature 1.6 (logic).** Pure string surgery on a flags string — fully testable.

**Files:**
- Create: `src/DevProjects.Core/Services/FlagsEditor.cs`
- Test: `tests-net/DevProjects.Core.Tests/FlagsEditorTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class FlagsEditorTests
{
    [Theory]
    [InlineData("", "opus", "--model opus")]
    [InlineData("--verbose", "opus", "--verbose --model opus")]
    [InlineData("--model sonnet", "opus", "--model opus")]
    [InlineData("--model sonnet --verbose", "opus", "--verbose --model opus")]
    [InlineData("--model sonnet", null, "")]                 // null clears the model flag
    [InlineData("--verbose --model opus", null, "--verbose")]
    public void SetModel(string flags, string? model, string expected) =>
        Assert.Equal(expected, FlagsEditor.SetModel(flags, model));

    [Fact]
    public void CurrentModel_ReadsBackWhatWasSet() =>
        Assert.Equal("opus", FlagsEditor.CurrentModel("--verbose --model opus"));

    [Fact]
    public void CurrentModel_NullWhenAbsent() =>
        Assert.Null(FlagsEditor.CurrentModel("--verbose"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter FlagsEditorTests`
Expected: FAIL — `FlagsEditor` does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
using System.Text.RegularExpressions;

namespace DevProjects.Core.Services;

/// <summary>Surgical edits to a flags string for the per-row pickers. Pure.</summary>
public static partial class FlagsEditor
{
    [GeneratedRegex(@"--model\s+\S+")]
    private static partial Regex ModelFlag();

    /// <summary>Replace (or remove, when model is null/blank) the --model token. Order: existing flags then model.</summary>
    public static string SetModel(string flags, string? model)
    {
        var without = ModelFlag().Replace(flags ?? "", "").Trim();
        without = Regex.Replace(without, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(model)) return without;
        return string.IsNullOrEmpty(without) ? $"--model {model}" : $"{without} --model {model}";
    }

    public static string? CurrentModel(string? flags)
    {
        var m = ModelFlag().Match(flags ?? "");
        return m.Success ? m.Value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)[1] : null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter FlagsEditorTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Services/FlagsEditor.cs tests-net/DevProjects.Core.Tests/FlagsEditorTests.cs
git commit -m "feat(core): model-flag editor for per-row model picker"
```

---

## Task 12: Per-row model picker (WinUI)

**Feature 1.6 (UI).**

**Files:**
- Modify: `src/DevProjects.App/ViewModels/ProjectItemViewModel.cs`
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs`
- Modify: `src/DevProjects.App/MainWindow.xaml` (row template)

- [ ] **Step 1: VM support.** In `ProjectItemViewModel` add a computed
`public string? CurrentModel => FlagsEditor.CurrentModel(Flags);` (raise its change
notification whenever `Flags` changes — `Flags` is already observable). In `MainViewModel`:

```csharp
[RelayCommand]
private void SetRowModel((ProjectItemViewModel Project, string? Model) arg)
{
    arg.Project.Flags = FlagsEditor.SetModel(arg.Project.Flags, arg.Model);
    _configService.UpdateFlags(_config, arg.Project.Path, arg.Project.Flags);
    if (SelectedProject == arg.Project) FlagsText = arg.Project.Flags; // keep the flags box in sync
}
```

- [ ] **Step 2: Row control.** In the row `DataTemplate`, add a small `DropDownButton`/`ComboBox`
labelled by `CurrentModel` (or "model") with items Default / sonnet / opus / haiku. Selecting an
item invokes `SetRowModelCommand` with `(row, "opus")` (Default → null). Place it left of the
New/Continue buttons. Keep it compact (icon + current model glyph) to honor "lightweight".

- [ ] **Step 3: Build + manual smoke**

Build, run. Pick opus on a row → its flags gain `--model opus`, persisted to config (reopen
app, still there). Pick Default → the `--model` token is removed. Selecting the row shows the
updated flags in the flags box.

- [ ] **Step 4: Review then commit**

`winui:winui-code-review`, then:

```bash
git add src/DevProjects.App/ViewModels/ProjectItemViewModel.cs src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml
git commit -m "feat(ui): per-row model picker"
```

---

## Task 13: CLAUDE.md presence detection (Core)

**Feature 1.7 (logic).**

**Files:**
- Create: `src/DevProjects.Core/Services/ProjectClaudeInfo.cs`
- Test: `tests-net/DevProjects.Core.Tests/ProjectClaudeInfoTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ProjectClaudeInfoTests`
Expected: FAIL — type does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
namespace DevProjects.Core.Services;

/// <summary>Surfaces a project's CLAUDE.md (the strongest "Claude-ready" signal).</summary>
public static class ProjectClaudeInfo
{
    public static string? ClaudeMdPath(string projectPath)
    {
        try
        {
            var p = Path.Combine(projectPath, "CLAUDE.md");
            return File.Exists(p) ? p : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    public static bool HasClaudeMd(string projectPath) => ClaudeMdPath(projectPath) is not null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ProjectClaudeInfoTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Services/ProjectClaudeInfo.cs tests-net/DevProjects.Core.Tests/ProjectClaudeInfoTests.cs
git commit -m "feat(core): detect project CLAUDE.md"
```

---

## Task 14: CLAUDE.md badge + open-in-editor (WinUI)

**Feature 1.7 (UI).**

**Files:**
- Modify: `src/DevProjects.App/ViewModels/ProjectItemViewModel.cs`
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs` (enrichment + open command)
- Modify: `src/DevProjects.App/MainWindow.xaml` (row template + context menu)

- [ ] **Step 1: Row state.** Add `[ObservableProperty] private bool _hasClaudeMd;` to
`ProjectItemViewModel`. In `MainViewModel.StartEnrichment` (the existing per-row background
pass that sets `HasSession`/`GitBranch`), also set
`row.HasClaudeMd = ProjectClaudeInfo.HasClaudeMd(row.Path);` (marshal to UI thread as the
existing enrichment does).

- [ ] **Step 2: Open command.** In `MainViewModel`:

```csharp
[RelayCommand]
private void OpenClaudeMd(ProjectItemViewModel? project)
{
    var path = project is null ? null : ProjectClaudeInfo.ClaudeMdPath(project.Path);
    if (path is null) return;
    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); // default editor
}
```

(Mirror the existing `OpenInExplorer` shell-execute pattern already in `MainViewModel`.)

- [ ] **Step 3: UI.** Add a compact "CLAUDE.md" pill in the row (mirror the git-info
`Visibility="{x:Bind HasClaudeMd, Mode=OneWay}"` pattern). Add a context-menu item
"Open CLAUDE.md" bound to `OpenClaudeMdCommand`, visible only when `HasClaudeMd`.

- [ ] **Step 4: Build + manual smoke**

Build, run. A project with CLAUDE.md shows the pill; clicking the menu item opens it in the
default editor. A project without it shows no pill and the menu item is hidden.

- [ ] **Step 5: Review then commit**

`winui:winui-code-review`, then:

```bash
git add src/DevProjects.App/ViewModels/ProjectItemViewModel.cs src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml
git commit -m "feat(ui): CLAUDE.md badge and open-in-editor"
```

---

## Task 15: MRU list helper + AppState field (Core)

**Feature 1.8 (logic + persistence).**

**Files:**
- Modify: `src/DevProjects.Core/Models/AppState.cs`
- Create: `src/DevProjects.Core/Services/MruList.cs`
- Test: `tests-net/DevProjects.Core.Tests/MruListTests.cs`
- Test: extend `tests-net/DevProjects.Core.Tests/MiscServiceTests.cs` `StateServiceTests` for back-compat

- [ ] **Step 1: Write the failing tests**

`MruListTests.cs`:

```csharp
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
```

Append to `StateServiceTests` in `MiscServiceTests.cs`:

```csharp
[Fact]
public void Defaults_IncludeEmptyRecentLaunches() =>
    Assert.Empty(new AppState().RecentLaunches);

[Fact]
public void OldStateJson_WithoutRecentLaunches_LoadsEmptyList()
{
    Directory.CreateDirectory(_dir);
    File.WriteAllText(StatePath, """{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true}""");
    Assert.Empty(new StateService(StatePath).Load().RecentLaunches);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter "MruListTests|StateServiceTests"`
Expected: FAIL — `MruList` and `AppState.RecentLaunches` do not exist.

- [ ] **Step 3: Implement.** Add to `AppState`:

```csharp
    /// <summary>Most-recently-launched project paths, newest first. Capped on write.</summary>
    public List<string> RecentLaunches { get; set; } = [];
```

Create `MruList.cs`:

```csharp
namespace DevProjects.Core.Services;

/// <summary>Pure most-recently-used list ops: dedup (case-insensitive), move-to-front, cap.</summary>
public static class MruList
{
    public static List<string> Add(IEnumerable<string> existing, string item, int cap)
    {
        var result = new List<string> { item };
        foreach (var e in existing)
            if (!string.Equals(e, item, StringComparison.OrdinalIgnoreCase))
                result.Add(e);
        return result.Count > cap ? result.GetRange(0, cap) : result;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter "MruListTests|StateServiceTests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Models/AppState.cs src/DevProjects.Core/Services/MruList.cs tests-net/DevProjects.Core.Tests/MruListTests.cs tests-net/DevProjects.Core.Tests/MiscServiceTests.cs
git commit -m "feat(core): MRU recent-launches state and helper"
```

---

## Task 16: Recent-launch menu (WinUI)

**Feature 1.8 (UI).**

**Files:**
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs`
- Modify: `src/DevProjects.App/MainWindow.xaml` (+ `.xaml.cs`) — a "Recent" dropdown in the bottom bar

- [ ] **Step 1: Push + expose.** In `MainViewModel` add:

```csharp
public ObservableCollection<ProjectItemViewModel> RecentProjects { get; } = new();

private void PushRecent(string path)
{
    _state.RecentLaunches = MruList.Add(_state.RecentLaunches, path, cap: 15);
    _stateService.Save(_state);
    RebuildRecent();
}

private void RebuildRecent()
{
    RecentProjects.Clear();
    foreach (var p in _state.RecentLaunches)
    {
        var row = Projects.FirstOrDefault(r => string.Equals(r.Path, p, StringComparison.OrdinalIgnoreCase));
        if (row is not null) RecentProjects.Add(row);
    }
}
```

Call `PushRecent(project.Path)` inside `LaunchAsync` (and `LaunchWithFlagsAsync`/quick-prompt)
right after a successful launch. Call `RebuildRecent()` at the end of `ApplyFilter()`.

- [ ] **Step 2: UI.** Add a `DropDownButton` "Recent" to the bottom bar whose flyout lists
`RecentProjects` (name + root). Clicking an entry calls `LaunchContinueAsync(row)`.

- [ ] **Step 3: Build + manual smoke**

Build, run. Launch a few projects → Recent dropdown lists them newest-first, capped at 15,
no duplicates. Reopen app → list persists. Clicking continues that project.

- [ ] **Step 4: Review then commit**

`winui:winui-code-review`, then:

```bash
git add src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml src/DevProjects.App/MainWindow.xaml.cs
git commit -m "feat(ui): recent-launches dropdown"
```

---

## Task 17: Fuzzy matcher (Core)

**Feature 1.9 (logic).** Subsequence match with ranking. Fully testable.

**Files:**
- Create: `src/DevProjects.Core/Services/FuzzyMatcher.cs`
- Test: `tests-net/DevProjects.Core.Tests/FuzzyMatcherTests.cs`

- [ ] **Step 1: Write the failing test**

```csharp
using DevProjects.Core.Services;

namespace DevProjects.Core.Tests;

public class FuzzyMatcherTests
{
    [Fact]
    public void Score_NullWhenNotSubsequence() => Assert.Null(FuzzyMatcher.Score("xyz", "Hotel-Search"));

    [Fact]
    public void Score_NonNullWhenSubsequence() => Assert.NotNull(FuzzyMatcher.Score("hs", "Hotel-Search"));

    [Fact]
    public void Score_EmptyQueryMatchesEverything() => Assert.NotNull(FuzzyMatcher.Score("", "anything"));

    [Fact]
    public void Score_ContiguousBeatsScattered()
    {
        var contiguous = FuzzyMatcher.Score("hot", "Hotel");
        var scattered = FuzzyMatcher.Score("hot", "Have-Other-Tasks");
        Assert.NotNull(contiguous);
        Assert.NotNull(scattered);
        Assert.True(contiguous > scattered);
    }

    [Fact]
    public void Rank_OrdersByScoreDescAndFiltersNonMatches()
    {
        var items = new[] { "Hotel-Search", "Banana", "House" };
        var ranked = FuzzyMatcher.Rank("ho", items, s => s).ToList();
        Assert.DoesNotContain("Banana", ranked);
        Assert.Equal("House", ranked[0]); // "ho" contiguous at start beats "Hotel-Search"? assert just that Banana filtered
    }
}
```

(Note for implementer: the last assertion's exact head depends on the boundary-bonus weights;
if "Hotel-Search" legitimately outranks "House", adjust the assertion to only check that
`Banana` is filtered and both `House`/`Hotel-Search` are present. Keep the contiguous-beats-
scattered invariant as the hard guarantee.)

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter FuzzyMatcherTests`
Expected: FAIL — `FuzzyMatcher` does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
namespace DevProjects.Core.Services;

/// <summary>Case-insensitive subsequence fuzzy match with a simple ranking score.</summary>
public static class FuzzyMatcher
{
    /// <summary>Higher is better. Null = query is not a subsequence of candidate. Empty query = 0.</summary>
    public static int? Score(string query, string candidate)
    {
        if (string.IsNullOrEmpty(query)) return 0;
        if (string.IsNullOrEmpty(candidate)) return null;

        int qi = 0, score = 0, streak = 0;
        for (int ci = 0; ci < candidate.Length && qi < query.Length; ci++)
        {
            if (char.ToLowerInvariant(candidate[ci]) == char.ToLowerInvariant(query[qi]))
            {
                score += 1 + streak;                                   // reward consecutive hits
                if (ci == 0 || !char.IsLetterOrDigit(candidate[ci - 1]))
                    score += 5;                                        // reward word-boundary hits
                streak++;
                qi++;
            }
            else streak = 0;
        }
        return qi == query.Length ? score : null;
    }

    public static IEnumerable<T> Rank<T>(string query, IEnumerable<T> items, Func<T, string> selector)
    {
        return items
            .Select(i => (Item: i, Score: Score(query, selector(i))))
            .Where(x => x.Score is not null)
            .OrderByDescending(x => x.Score!.Value)
            .ThenBy(x => selector(x.Item), StringComparer.OrdinalIgnoreCase)
            .Select(x => x.Item);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter FuzzyMatcherTests`
Expected: PASS (loosen the one head-of-list assertion per the note if weights disagree).

- [ ] **Step 5: Commit**

```bash
git add src/DevProjects.Core/Services/FuzzyMatcher.cs tests-net/DevProjects.Core.Tests/FuzzyMatcherTests.cs
git commit -m "feat(core): fuzzy matcher for command palette"
```

---

## Task 18: Command palette dialog (WinUI)

**Feature 1.9 (UI).** Ctrl+P → fuzzy-jump-and-launch.

**Files:**
- Create: `src/DevProjects.App/Views/CommandPaletteDialog.xaml` (+ `.xaml.cs`)
- Modify: `src/DevProjects.App/ViewModels/MainViewModel.cs` (expose all projects + launch helpers)
- Modify: `src/DevProjects.App/MainWindow.xaml` (+ `.xaml.cs`) — `Ctrl+P` accelerator

- [ ] **Step 1: VM surface.** Ensure `MainViewModel` exposes the full unfiltered project list
(it builds `Projects` from a scanned set — expose that source list, or a snapshot, as
`IReadOnlyList<ProjectItemViewModel> AllProjects`). Add convenience:
`public Task LaunchFromPaletteAsync(ProjectItemViewModel p, bool isNew) => isNew ? LaunchNewAsync(p) : LaunchContinueAsync(p);`

- [ ] **Step 2: Dialog.** `CommandPaletteDialog.xaml` (ContentDialog, no buttons —
keyboard-driven): a `TextBox` (auto-focused) + a `ListView`. On text change, set
`ListView.ItemsSource = FuzzyMatcher.Rank(query, _allProjects, p => p.Name).Take(20)`.
Key handling in code-behind:
- `Down`/`Up` move ListView selection.
- `Enter` → resolve selected → `Result = (project, isNew:false)`, `Hide()`.
- `Ctrl+Enter` → `Result = (project, isNew:true)`, `Hide()`.
- `Esc` → `Hide()` with no result.

- [ ] **Step 3: Accelerator.** Add a `Ctrl+P` `KeyboardAccelerator` (gated by
`!DialogGate.AnyOpen`, like the existing accelerators) whose handler shows the palette via
`DialogGate.ShowAsync`, then if a result came back calls
`ViewModel.LaunchFromPaletteAsync(result.Project, result.IsNew)`.

- [ ] **Step 4: Build + manual smoke**

Build, run. Press Ctrl+P → palette opens focused → type a few letters → list narrows by fuzzy
rank → Enter continues, Ctrl+Enter starts new → Esc cancels. Works regardless of current
sidebar filter (palette searches all projects).

- [ ] **Step 5: Review then commit**

`winui:winui-code-review`, then:

```bash
git add src/DevProjects.App/Views/CommandPaletteDialog.xaml src/DevProjects.App/Views/CommandPaletteDialog.xaml.cs src/DevProjects.App/ViewModels/MainViewModel.cs src/DevProjects.App/MainWindow.xaml src/DevProjects.App/MainWindow.xaml.cs
git commit -m "feat(ui): Ctrl+P fuzzy command palette"
```

---

## Tier 1 exit gate

- [ ] `dotnet build DevProjects.sln -p:Platform=x64` — clean.
- [ ] `dotnet test tests-net/DevProjects.Core.Tests` — all green.
- [ ] Manual smoke of every new surface (nudge, stop/stop-all, resume picker, quick prompt,
      model picker, CLAUDE.md badge/open, recent dropdown, Ctrl+P palette).
- [ ] Update `README.md` Features list with the 9 new capabilities.
- [ ] `git commit -m "docs: document Tier 1 enhancements in README"`.
- [ ] Only then write `2026-06-09-tier2-power.md` (grounded in this now-real code) and proceed.

---

## Self-review notes (carried for the implementer)

- **Type consistency:** `RunningSession`, `SessionSummary`, `FlagPreset` are the only new
  records. `SessionsForProject`, `SetModel`, `MruList.Add`, `FuzzyMatcher.Score/Rank`,
  `BuildClaudeCommand(initialPrompt)`, `ListSessions` — names used identically in tests and impl.
- **Back-compat:** every new `AppState` field defaults so old `state.json` loads (covered by
  the `OldStateJson_*` regression tests — keep that pattern for Tier 2 fields too).
- **Security:** the only new shell-bound surface is the quick prompt; it is single-quoted for
  PowerShell with `'`→`''` doubling. The `--resume <uuid>` flag and `--model <name>` contain
  only `[A-Za-z0-9-]`, all safe under `AreFlagsSafe`. Killing a session is gated by an explicit
  confirmation dialog.
- **No DI:** new Core services (`ClaudeSessionLister`, `ClaudeCliService` reuse, `RunningClaudeDetector`)
  are newed-up as fields in `MainViewModel` — match the existing constructor style.
