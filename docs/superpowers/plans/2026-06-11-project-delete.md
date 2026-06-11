# Project Deletion & Hiding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Hide from console" (non-destructive, path-based hidden list) and "Delete from disk…" (Recycle Bin or permanent, with confirmation dialog and config/trust cleanup) to the project context menu, plus a restore UI in Settings.

**Architecture:** Core gets a `Hidden` path list on `LauncherConfig` (scanner skips those paths), a `ClaudeTrust.RemoveTrust` mirror of `EnsureTrusted`, and a new `ProjectDeleter` static service (Recycle Bin via `SHFileOperationW` P/Invoke; permanent via `Directory.Delete` with a read-only-clearing retry for git objects). The WinUI layer adds two context-menu items, a `DeleteProjectDialog` ContentDialog, `HideProject`/`DeleteProjectAsync`/`RestoreHidden` on `MainViewModel`, and a hidden-projects list in `SettingsDialog`.

**Tech Stack:** .NET 10, WinUI 3 (Windows App SDK), CommunityToolkit.Mvvm, xUnit (`tests-net/Ccmc.Core.Tests`).

**Spec:** `docs/superpowers/specs/2026-06-11-project-delete-design.md`

**Conventions you must know:**
- Core namespace is `Ccmc.Core.*`; the WinUI app namespace is `Ccmc.App.*` (NOT `Ccmc.WinUI`).
- All path comparisons are `StringComparison.OrdinalIgnoreCase` / `StringComparer.OrdinalIgnoreCase` (Windows paths).
- Test command: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj`
- Full build check: `dotnet build Ccmc.sln`
- `~\.claude.json` is owned by Claude Code (holds OAuth tokens) — never create or clobber it; all edits are surgical merges with atomic writes, fail-soft (return false, never throw).

---

### Task 1: `Hidden` list — model, normalization, scanner skip

**Files:**
- Modify: `src/Ccmc.Core/Models/LauncherConfig.cs`
- Modify: `src/Ccmc.Core/Services/ConfigService.cs` (`Normalize`, ~line 137)
- Modify: `src/Ccmc.Core/Services/ProjectScanner.cs` (~line 19)
- Test: `tests-net/Ccmc.Core.Tests/ProjectScannerTests.cs`
- Test: `tests-net/Ccmc.Core.Tests/ConfigServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Append to `ProjectScannerTests` (inside the existing class):

```csharp
    [Fact]
    public void Scan_SkipsHiddenPaths_CaseInsensitively()
    {
        var hide = Directory.CreateDirectory(Path.Combine(_root, "Secret"));
        Directory.CreateDirectory(Path.Combine(_root, "Keep"));
        var config = MakeConfig();
        config.Hidden = [hide.FullName.ToUpperInvariant()];

        var projects = ProjectScanner.Scan(config);

        Assert.Equal(["Keep"], projects.Select(p => p.Name).ToArray());
    }

    [Fact]
    public void Scan_HiddenDoesNotMatchByNameAlone()
    {
        // Hidden is path-based: a project with the same NAME under this root
        // must still appear when the hidden entry points elsewhere.
        Directory.CreateDirectory(Path.Combine(_root, "Tools"));
        var config = MakeConfig();
        config.Hidden = [@"C:\Somewhere\Else\Tools"];

        var projects = ProjectScanner.Scan(config);

        Assert.Equal(["Tools"], projects.Select(p => p.Name).ToArray());
    }
```

Append to `ConfigServiceTests` (match the file's existing temp-dir pattern; if it differs, adapt the temp-path plumbing but keep the assertions):

```csharp
    [Fact]
    public void Load_NormalizesHiddenList_DroppingBlankEntries()
    {
        var dir = Directory.CreateTempSubdirectory("devprojects-cfg-hidden-").FullName;
        try
        {
            var path = Path.Combine(dir, "config.json");
            File.WriteAllText(path, """{"roots":[],"hidden":["C:\\Dev\\X",""," "]}""");

            var config = new ConfigService(path).Load();

            Assert.Equal([@"C:\Dev\X"], config.Hidden);
        }
        finally { Directory.Delete(dir, recursive: true); }
    }

    [Fact]
    public void Load_BackfillsHidden_WhenMissingFromOlderConfig()
    {
        var dir = Directory.CreateTempSubdirectory("devprojects-cfg-hidden2-").FullName;
        try
        {
            var path = Path.Combine(dir, "config.json");
            File.WriteAllText(path, """{"roots":[]}""");

            var config = new ConfigService(path).Load();

            Assert.NotNull(config.Hidden);
            Assert.Empty(config.Hidden!);
        }
        finally { Directory.Delete(dir, recursive: true); }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter "Hidden"`
Expected: compile error — `LauncherConfig` has no `Hidden` property. That counts as the failing state.

- [ ] **Step 3: Implement**

In `LauncherConfig.cs`, after the `Ignore` property (line 12):

```csharp
    /// <summary>Full project paths hidden from the console via "Hide from console" (path-based,
    /// unlike the name-based Ignore list inherited from the PowerShell launcher).</summary>
    public List<string>? Hidden { get; set; }
```

In `CreateDefault()`, after `Ignore = [],`:

```csharp
        Hidden = [],
```

In `ConfigService.Normalize`, after `config.Ignore ??= [];` (line 142):

```csharp
        config.Hidden ??= [];
```

And after the `config.Ignore = ...Where(...)` line (line 148):

```csharp
        config.Hidden = config.Hidden!.Where(h => !string.IsNullOrWhiteSpace(h)).ToList();
```

In `ProjectScanner.Scan`, after the `Ignore` check (line 20):

```csharp
                if (config.Hidden is not null &&
                    config.Hidden.Contains(dir.FullName, StringComparer.OrdinalIgnoreCase)) continue;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj`
Expected: all tests PASS (full suite — the new property must not break existing config tests).

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Models/LauncherConfig.cs src/Ccmc.Core/Services/ConfigService.cs src/Ccmc.Core/Services/ProjectScanner.cs tests-net/Ccmc.Core.Tests/ProjectScannerTests.cs tests-net/Ccmc.Core.Tests/ConfigServiceTests.cs
git commit -m "feat(core): path-based hidden-projects list in config and scanner"
```

---

### Task 2: `ClaudeTrust.RemoveTrust`

**Files:**
- Modify: `src/Ccmc.Core/Services/ClaudeTrust.cs`
- Test: `tests-net/Ccmc.Core.Tests/ClaudeTrustTests.cs`

- [ ] **Step 1: Write the failing tests**

Append to `ClaudeTrustTests` (uses the existing `_dir` / `ClaudeJson` / `ReadBack` members):

```csharp
    [Fact]
    public void RemoveTrust_RemovesEntry_PreservingOtherProjectsAndTopLevelKeys()
    {
        File.WriteAllText(ClaudeJson,
            """{"oauthAccount":{"email":"x@y.z"},"projects":{"C:\\Dev\\Proj":{"hasTrustDialogAccepted":true},"C:\\Other":{"hasTrustDialogAccepted":true}}}""");

        Assert.True(ClaudeTrust.RemoveTrust(@"C:\Dev\Proj", ClaudeJson));

        var root = ReadBack();
        var projects = root["projects"]!.AsObject();
        Assert.Single(projects);
        Assert.NotNull(projects[@"C:\Other"]);
        Assert.Equal("x@y.z", (string)root["oauthAccount"]!["email"]!);
    }

    [Fact]
    public void RemoveTrust_MatchesKeyCaseInsensitively()
    {
        File.WriteAllText(ClaudeJson,
            """{"projects":{"c:\\dev\\proj":{"hasTrustDialogAccepted":true}}}""");

        Assert.True(ClaudeTrust.RemoveTrust(@"C:\Dev\Proj\", ClaudeJson));

        Assert.Empty(ReadBack()["projects"]!.AsObject());
    }

    [Fact]
    public void RemoveTrust_NoOp_WhenEntryAbsent_FileLeftUntouched()
    {
        var original = """{"projects":{"C:\\Other":{"hasTrustDialogAccepted":true}}}""";
        File.WriteAllText(ClaudeJson, original);

        Assert.False(ClaudeTrust.RemoveTrust(@"C:\Dev\Proj", ClaudeJson));

        Assert.Equal(original, File.ReadAllText(ClaudeJson));
    }

    [Fact]
    public void RemoveTrust_NoOp_WhenClaudeJsonMissing()
    {
        Assert.False(ClaudeTrust.RemoveTrust(@"C:\Dev\Proj", ClaudeJson));
        Assert.False(File.Exists(ClaudeJson));
    }

    [Fact]
    public void RemoveTrust_NoOp_OnCorruptJson_FileLeftUntouched()
    {
        File.WriteAllText(ClaudeJson, "{ not json");
        Assert.False(ClaudeTrust.RemoveTrust(@"C:\Dev\Proj", ClaudeJson));
        Assert.Equal("{ not json", File.ReadAllText(ClaudeJson));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter "RemoveTrust"`
Expected: compile error — `RemoveTrust` does not exist.

- [ ] **Step 3: Implement**

Append to the `ClaudeTrust` class (after `EnsureTrusted`):

```csharp
    /// <summary>
    /// Removes a project's entry from ~\.claude.json after the project is deleted.
    /// Same contract as EnsureTrusted: surgical merge, atomic write, no-op on a
    /// missing/unparseable file or absent entry, fail-soft (never throws).
    /// </summary>
    /// <param name="claudeJsonPath">Override for the ~\.claude.json path (tests).</param>
    /// <returns>True when an entry was removed; false otherwise.</returns>
    public static bool RemoveTrust(string projectPath, string? claudeJsonPath = null)
    {
        if (string.IsNullOrWhiteSpace(projectPath)) return false;
        var path = projectPath.TrimEnd('\\', '/');
        if (path.Length == 0) return false;

        claudeJsonPath ??= Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude.json");

        try
        {
            if (!File.Exists(claudeJsonPath)) return false;

            if (JsonNode.Parse(File.ReadAllText(claudeJsonPath)) is not JsonObject root)
                return false;

            if (root["projects"] is not JsonObject projects) return false;

            var key = projects.Select(p => p.Key)
                .FirstOrDefault(k => string.Equals(k, path, StringComparison.OrdinalIgnoreCase));
            if (key is null) return false; // nothing to remove — don't touch the file

            projects.Remove(key);

            // Atomic write: a crash mid-write must never truncate the real file.
            var temp = claudeJsonPath + ".tmp";
            File.WriteAllText(temp, root.ToJsonString(WriteOpts));
            File.Move(temp, claudeJsonPath, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or InvalidOperationException)
        {
            return false;
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter "ClaudeTrust"`
Expected: all PASS (new and pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/ClaudeTrust.cs tests-net/Ccmc.Core.Tests/ClaudeTrustTests.cs
git commit -m "feat(core): ClaudeTrust.RemoveTrust drops a project's ~/.claude.json entry"
```

---

### Task 3: `ProjectDeleter` Core service

**Files:**
- Create: `src/Ccmc.Core/Services/ProjectDeleter.cs`
- Test: `tests-net/Ccmc.Core.Tests/ProjectDeleterTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests-net/Ccmc.Core.Tests/ProjectDeleterTests.cs`:

```csharp
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public sealed class ProjectDeleterTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("devprojects-delete-").FullName;

    public void Dispose()
    {
        // Tests may leave read-only leftovers on failure; clear before cleanup.
        if (!Directory.Exists(_dir)) return;
        foreach (var entry in Directory.EnumerateFileSystemEntries(_dir, "*", SearchOption.AllDirectories))
            File.SetAttributes(entry, FileAttributes.Normal);
        Directory.Delete(_dir, recursive: true);
    }

    [Fact]
    public void Permanent_DeletesTree_IncludingReadOnlyFiles()
    {
        // Git object/pack files are read-only; a plain recursive delete fails on them.
        var proj = Directory.CreateDirectory(Path.Combine(_dir, "Proj"));
        var objects = Directory.CreateDirectory(Path.Combine(proj.FullName, ".git", "objects"));
        var packFile = Path.Combine(objects.FullName, "pack-abc.idx");
        File.WriteAllText(packFile, "x");
        File.SetAttributes(packFile, FileAttributes.ReadOnly);

        ProjectDeleter.Delete(proj.FullName, permanent: true);

        Assert.False(Directory.Exists(proj.FullName));
    }

    [Fact]
    public void Permanent_TrimsTrailingSeparator()
    {
        var proj = Directory.CreateDirectory(Path.Combine(_dir, "Trail"));

        ProjectDeleter.Delete(proj.FullName + @"\", permanent: true);

        Assert.False(Directory.Exists(proj.FullName));
    }

    [Fact]
    public void Throws_WhenFolderMissing()
    {
        Assert.Throws<DirectoryNotFoundException>(() =>
            ProjectDeleter.Delete(Path.Combine(_dir, "nope"), permanent: true));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter "ProjectDeleter"`
Expected: compile error — `ProjectDeleter` does not exist.

- [ ] **Step 3: Implement**

Create `src/Ccmc.Core/Services/ProjectDeleter.cs`:

```csharp
using System.Runtime.InteropServices;

namespace Ccmc.Core.Services;

/// <summary>
/// Deletes a project folder, either to the Recycle Bin (default) or permanently.
/// Callers are responsible for cleaning up config/pin/trust entries afterwards
/// and rescanning (same contract as ProjectMover).
/// </summary>
public static class ProjectDeleter
{
    public static void Delete(string projectPath, bool permanent)
    {
        var path = Path.GetFullPath(projectPath.TrimEnd('\\', '/'));
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Project folder not found: {path}");

        if (permanent) DeletePermanent(path);
        else RecycleViaShell(path);
    }

    private static void DeletePermanent(string path)
    {
        try
        {
            Directory.Delete(path, recursive: true);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // Git object/pack files are read-only and make a plain recursive
            // delete fail; clear attributes and retry once.
            foreach (var entry in Directory.EnumerateFileSystemEntries(path, "*", SearchOption.AllDirectories))
                File.SetAttributes(entry, FileAttributes.Normal);
            Directory.Delete(path, recursive: true);
        }
    }

    private static void RecycleViaShell(string path)
    {
        var op = new SHFILEOPSTRUCTW
        {
            wFunc = FO_DELETE,
            // The shell expects a double-null-terminated list; the marshaller
            // appends one terminator, so add the second explicitly.
            pFrom = path + "\0",
            fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
        };
        var result = SHFileOperationW(ref op);
        if (op.fAnyOperationsAborted)
            throw new OperationCanceledException("The delete operation was cancelled.");
        if (result != 0)
            throw new IOException($"Could not move the folder to the Recycle Bin (shell error 0x{result:X}).");
    }

    private const uint FO_DELETE = 3;
    private const ushort FOF_NOCONFIRMATION = 0x0010;
    private const ushort FOF_ALLOWUNDO = 0x0040;
    private const ushort FOF_NOERRORUI = 0x0400;
    private const ushort FOF_SILENT = 0x0004;

    // Note: SHFILEOPSTRUCTW is packed only on x86; default sequential layout is
    // correct for the x64/arm64 builds this app ships.
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEOPSTRUCTW
    {
        public IntPtr hwnd;
        public uint wFunc;
        [MarshalAs(UnmanagedType.LPWStr)] public string pFrom;
        [MarshalAs(UnmanagedType.LPWStr)] public string? pTo;
        public ushort fFlags;
        [MarshalAs(UnmanagedType.Bool)] public bool fAnyOperationsAborted;
        public IntPtr hNameMappings;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszProgressTitle;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHFileOperationW(ref SHFILEOPSTRUCTW lpFileOp);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj --filter "ProjectDeleter"`
Expected: 3 PASS. (The Recycle Bin path is shell-API-backed and is verified manually in Task 6's final check, not unit-tested.)

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/ProjectDeleter.cs tests-net/Ccmc.Core.Tests/ProjectDeleterTests.cs
git commit -m "feat(core): ProjectDeleter with Recycle Bin and permanent modes"
```

---

### Task 4: ViewModel — `HideProject`, `DeleteProjectAsync`, `HiddenProjects`, `RestoreHidden`

**Files:**
- Modify: `src/Ccmc.WinUI/ViewModels/MainViewModel.cs` (add after `RemoveRoot`, ~line 1068)

No Core unit tests here — the tests-net suite covers Core only; the ViewModel wires Core pieces already under test. Verified by build + Task 6 manual check.

- [ ] **Step 1: Implement the four members**

Add after `RemoveRoot` (line 1068), before `SetDefaultRoot`:

```csharp
    // ---------- Hide / delete projects ----------

    /// <summary>Hides a project from the list (path-based, non-destructive). Restore via Settings.</summary>
    public void HideProject(ProjectItemViewModel? project)
    {
        if (project is null) return;
        _config.Hidden ??= [];
        if (!_config.Hidden.Contains(project.Path, StringComparer.OrdinalIgnoreCase))
            _config.Hidden.Add(project.Path);
        _state.Pinned.RemoveAll(p => string.Equals(p, project.Path, StringComparison.OrdinalIgnoreCase));
        _stateService.Save(_state);
        _configService.Save(_config);
        Rescan();
        ShellEntriesChanged?.Invoke();
        ToastRequested?.Invoke($"Hid {project.Name} — restore it in Settings");
    }

    /// <summary>Paths hidden via HideProject, shown in Settings for restoring.</summary>
    public IReadOnlyList<string> HiddenProjects => (_config.Hidden ?? []).ToList();

    public void RestoreHidden(string path)
    {
        _config.Hidden?.RemoveAll(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase));
        _configService.Save(_config);
        Rescan();
    }

    /// <summary>
    /// Deletes the project folder (Recycle Bin or permanent), then cleans up the
    /// pin, config usage entry and ~/.claude.json trust entry. Session transcripts
    /// under ~/.claude/projects are intentionally left alone.
    /// </summary>
    public async Task DeleteProjectAsync(ProjectItemViewModel project, bool permanent)
    {
        try
        {
            await Task.Run(() => ProjectDeleter.Delete(project.Path, permanent));
            _state.Pinned.RemoveAll(p => string.Equals(p, project.Path, StringComparison.OrdinalIgnoreCase));
            _stateService.Save(_state);
            _config.Projects?.Remove(project.Path);
            _configService.Save(_config);
            ClaudeTrust.RemoveTrust(project.Path);
            ToastRequested?.Invoke(permanent
                ? $"Deleted {project.Name}"
                : $"Moved {project.Name} to the Recycle Bin");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
            or OperationCanceledException or DirectoryNotFoundException)
        {
            await _dialogs.ShowMessageAsync("Delete project",
                $"Could not delete {project.Name}: {ex.Message}");
        }
        finally
        {
            // A failed delete may still be partial — always rescan.
            Rescan();
            ShellEntriesChanged?.Invoke();
        }
    }
```

- [ ] **Step 2: Build to verify**

Run: `dotnet build src/Ccmc.Core/Ccmc.Core.csproj && dotnet build Ccmc.sln`
Expected: Build succeeded, 0 errors. (If `ShellEntriesChanged` or `ToastRequested` names don't resolve, check their exact declarations near the top of MainViewModel — both exist and are invoked elsewhere, e.g. `TogglePin` line 802 and `AddRoot` line 1058.)

- [ ] **Step 3: Commit**

```bash
git add src/Ccmc.WinUI/ViewModels/MainViewModel.cs
git commit -m "feat(ui): hide, restore and delete project operations on MainViewModel"
```

---

### Task 5: Delete dialog + context menu items

**Files:**
- Create: `src/Ccmc.WinUI/Views/DeleteProjectDialog.xaml`
- Create: `src/Ccmc.WinUI/Views/DeleteProjectDialog.xaml.cs`
- Modify: `src/Ccmc.WinUI/MainWindow.xaml` (row `MenuFlyout`, after the "Project files" sub-item, line 216)
- Modify: `src/Ccmc.WinUI/MainWindow.xaml.cs` (handlers, near `Rename_Click` line 608)

- [ ] **Step 1: Create the dialog XAML**

Create `src/Ccmc.WinUI/Views/DeleteProjectDialog.xaml`:

```xml
<ContentDialog x:Class="Ccmc.App.Views.DeleteProjectDialog"
               xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
               xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
               Title="Delete project"
               PrimaryButtonText="Delete"
               CloseButtonText="Cancel"
               DefaultButton="Close">
    <ContentDialog.PrimaryButtonStyle>
        <Style TargetType="Button">
            <Setter Property="Background" Value="{ThemeResource SystemFillColorCriticalBrush}"/>
            <Setter Property="Foreground" Value="{ThemeResource TextOnAccentFillColorPrimaryBrush}"/>
        </Style>
    </ContentDialog.PrimaryButtonStyle>
    <StackPanel MinWidth="420" Spacing="8">
        <TextBlock x:Name="HeaderText" TextWrapping="Wrap"/>
        <TextBlock x:Name="PathText" Opacity="0.65" TextWrapping="Wrap"
                   Style="{StaticResource CaptionTextBlockStyle}"/>
        <InfoBar x:Name="DirtyBar" Severity="Warning" IsOpen="False" IsClosable="False"
                 Title="Uncommitted changes"
                 Message="This repository has uncommitted changes that will be lost."/>
        <InfoBar x:Name="RunningBar" Severity="Error" IsOpen="False" IsClosable="False"
                 Title="Session running"
                 Message="A Claude session is running in this project. Stop it first (right-click → Stop session)."/>
        <CheckBox x:Name="PermanentCheck" Content="Permanently delete (skip Recycle Bin)"
                  AutomationProperties.AutomationId="PermanentDeleteCheck"
                  ToolTipService.ToolTip="When unchecked, the folder goes to the Windows Recycle Bin and can be restored."/>
    </StackPanel>
</ContentDialog>
```

- [ ] **Step 2: Create the code-behind**

Create `src/Ccmc.WinUI/Views/DeleteProjectDialog.xaml.cs`:

```csharp
using Microsoft.UI.Xaml.Controls;

namespace Ccmc.App.Views;

public sealed partial class DeleteProjectDialog : ContentDialog
{
    public DeleteProjectDialog(string name, string path, bool gitDirty, bool isRunning)
    {
        InitializeComponent();
        HeaderText.Text = $"Delete '{name}' and all its contents?";
        PathText.Text = path;
        DirtyBar.IsOpen = gitDirty;
        RunningBar.IsOpen = isRunning;
        // A live session holds file locks and the user may lose work — block outright.
        IsPrimaryButtonEnabled = !isRunning;
        PermanentCheck.IsEnabled = !isRunning;
    }

    public bool Permanent => PermanentCheck.IsChecked == true;
}
```

- [ ] **Step 3: Add the context-menu items**

In `src/Ccmc.WinUI/MainWindow.xaml`, after the closing `</MenuFlyoutSubItem>` of "Project files" (line 216), before `</MenuFlyout>`:

```xml
                                            <MenuFlyoutSeparator/>
                                            <MenuFlyoutItem Text="Hide from console" Click="Hide_Click"
                                                            AutomationProperties.AutomationId="HideProjectMenuItem"
                                                            ToolTipService.ToolTip="Remove this project from the list without touching its files. Restore it from Settings."/>
                                            <MenuFlyoutItem Text="Delete from disk…" Click="Delete_Click"
                                                            AutomationProperties.AutomationId="DeleteProjectMenuItem"
                                                            ToolTipService.ToolTip="Delete the project folder and all its contents from disk.">
                                                <MenuFlyoutItem.Icon>
                                                    <FontIcon Glyph="&#xE74D;"
                                                              Foreground="{ThemeResource SystemFillColorCriticalBrush}"/>
                                                </MenuFlyoutItem.Icon>
                                            </MenuFlyoutItem>
```

- [ ] **Step 4: Add the handlers**

In `src/Ccmc.WinUI/MainWindow.xaml.cs`, after `ShowRenameDialogAsync` (line 660):

```csharp
    private void Hide_Click(object sender, RoutedEventArgs e) =>
        ViewModel.HideProject(ItemOf(sender));

    private void Delete_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is { } project) _ = ShowDeleteDialogAsync(project);
    }

    private async Task ShowDeleteDialogAsync(ProjectItemViewModel project)
    {
        var dialog = new DeleteProjectDialog(project.Name, project.Path, project.GitDirty, project.IsRunning)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary)
            await ViewModel.DeleteProjectAsync(project, dialog.Permanent);
    }
```

- [ ] **Step 5: Build to verify**

Run: `dotnet build Ccmc.sln`
Expected: Build succeeded, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/Ccmc.WinUI/Views/DeleteProjectDialog.xaml src/Ccmc.WinUI/Views/DeleteProjectDialog.xaml.cs src/Ccmc.WinUI/MainWindow.xaml src/Ccmc.WinUI/MainWindow.xaml.cs
git commit -m "feat(ui): hide and delete actions in the project context menu"
```

---

### Task 6: Settings — hidden projects restore list

**Files:**
- Modify: `src/Ccmc.WinUI/Views/SettingsDialog.xaml`
- Modify: `src/Ccmc.WinUI/Views/SettingsDialog.xaml.cs`

- [ ] **Step 1: Add the XAML section**

In `SettingsDialog.xaml`, add two row definitions after the existing five (line 13):

```xml
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
```

Then after the `CloseToTrayToggle` element (line 78), before `</Grid>`:

```xml
        <TextBlock x:Name="HiddenHeader" Grid.Row="5" Text="Hidden projects"
                   ToolTipService.ToolTip="Projects removed from the list via 'Hide from console'. Their folders are untouched."/>

        <Grid x:Name="HiddenGrid" Grid.Row="6" ColumnSpacing="10">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>
            <ListView x:Name="HiddenList" Grid.Column="0" SelectionMode="Single"
                      AutomationProperties.AutomationId="HiddenProjectsList"
                      MaxHeight="120"
                      BorderThickness="1"
                      BorderBrush="{ThemeResource ControlStrokeColorDefaultBrush}"
                      CornerRadius="{ThemeResource ControlCornerRadius}"/>
            <Button x:Name="RestoreButton" Grid.Column="1" Content="Restore" MinWidth="92"
                    VerticalAlignment="Top" Click="RestoreButton_Click"
                    AutomationProperties.AutomationId="RestoreHiddenButton"
                    ToolTipService.ToolTip="Show the selected project in the list again"/>
        </Grid>
```

- [ ] **Step 2: Wire the code-behind**

In `SettingsDialog.xaml.cs`, extend `RefreshLists()` (line 30) — add before `_loading = false;`:

```csharp
        var hidden = _viewModel.HiddenProjects;
        HiddenList.ItemsSource = hidden;
        var hasHidden = hidden.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        HiddenHeader.Visibility = hasHidden;
        HiddenGrid.Visibility = hasHidden;
```

Add a handler after `RemoveButton_Click` (line 76):

```csharp
    private void RestoreButton_Click(object sender, RoutedEventArgs e)
    {
        if (HiddenList.SelectedItem is not string path) return;
        _viewModel.RestoreHidden(path);
        RefreshLists();
    }
```

- [ ] **Step 3: Build and run the full test suite**

Run: `dotnet build Ccmc.sln && dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj`
Expected: Build succeeded; all tests PASS.

- [ ] **Step 4: Manual verification (run the app)**

Launch the app (`launcher.cmd` or `dotnet run --project src/Ccmc.WinUI`). Verify:
1. Right-click a throwaway project → **Hide from console** → row disappears; Settings shows it under "Hidden projects"; **Restore** brings it back.
2. Create a scratch project (New Project), right-click → **Delete from disk…** → dialog shows name/path; confirm with checkbox UNCHECKED → folder lands in the Recycle Bin, row disappears.
3. Repeat with checkbox CHECKED on a scratch git repo (`git init` inside so read-only objects exist) → folder fully removed.
4. Start a Claude session in a project, open its delete dialog → "Session running" InfoBar shows, Delete button disabled.

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.WinUI/Views/SettingsDialog.xaml src/Ccmc.WinUI/Views/SettingsDialog.xaml.cs
git commit -m "feat(ui): restore hidden projects from Settings"
```
