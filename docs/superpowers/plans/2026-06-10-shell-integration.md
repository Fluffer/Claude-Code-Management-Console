# Windows Shell Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tray icon with quick-launch menu and close-to-tray, taskbar jump list, `ccmc://` protocol registration for unpackaged installs, and a "Copy deep link" context-menu item.

**Architecture:** Pure logic (link building, pipe message protocol, menu composition) lives in `Ccmc.Core` with xUnit tests. Thin guarded Win32/COM interop (`Shell_NotifyIcon`, `ICustomDestinationList`, HKCU registry) lives in `Ccmc.WinUI/Services`, following the existing `GlobalHotkey` hand-rolled-interop precedent. All launch paths (argv, pipe, packaged protocol activation) converge on the existing `MainViewModel.HandleDeepLink`.

**Tech Stack:** .NET 10, WinUI 3 (Windows App SDK), raw P/Invoke + COM interop, xUnit. **Zero new NuGet dependencies.**

**Spec:** `docs/superpowers/specs/2026-06-10-shell-integration-design.md`
**Branch:** `feat/shell-integration` (already created, current).

**Build/test commands used throughout:**
```powershell
dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo
dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo
```
The WinUI project has 36 pre-existing `MVVMTK0045` warnings — ignore them; only errors matter.

---

### Task 1: DeepLinkBuilder (Core)

**Files:**
- Create: `src/Ccmc.Core/Services/DeepLinkBuilder.cs`
- Test: `tests-net/Ccmc.Core.Tests/DeepLinkBuilderTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class DeepLinkBuilderTests
{
    [Fact]
    public void Build_RoundTripsThroughParser()
    {
        var uri = DeepLinkBuilder.Build("Hotel-Search");
        var parsed = DeepLinkParser.Parse(uri);
        Assert.NotNull(parsed);
        Assert.Equal("launch", parsed!.Value.Action);
        Assert.Equal("Hotel-Search", parsed.Value.Project);
        Assert.False(parsed.Value.NewSession);
    }

    [Fact]
    public void Build_EncodesSpecialCharacters_RoundTrips()
    {
        var uri = DeepLinkBuilder.Build(@"C:\Dev\My App & Co");
        var parsed = DeepLinkParser.Parse(uri);
        Assert.NotNull(parsed);
        Assert.Equal(@"C:\Dev\My App & Co", parsed!.Value.Project);
    }

    [Fact]
    public void Build_NewSessionFlag_RoundTrips()
    {
        var uri = DeepLinkBuilder.Build("Foo", newSession: true);
        var parsed = DeepLinkParser.Parse(uri);
        Assert.True(parsed!.Value.NewSession);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: FAIL — `DeepLinkBuilder` does not exist (compile error CS0103).

- [ ] **Step 3: Write the implementation**

```csharp
namespace Ccmc.Core.Services;

/// <summary>Builds ccmc://launch deep links. Inverse of <see cref="DeepLinkParser"/>.</summary>
public static class DeepLinkBuilder
{
    public static string Build(string project, bool newSession = false)
    {
        var uri = $"{DeepLinkParser.Scheme}://launch?project={Uri.EscapeDataString(project)}";
        return newSession ? uri + "&new=true" : uri;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: PASS (215 total).

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/DeepLinkBuilder.cs tests-net/Ccmc.Core.Tests/DeepLinkBuilderTests.cs
git commit -m "feat(core): DeepLinkBuilder for ccmc:// links"
```

---

### Task 2: ActivationMessage pipe protocol (Core)

**Files:**
- Create: `src/Ccmc.Core/Services/ActivationMessage.cs`
- Test: `tests-net/Ccmc.Core.Tests/ActivationMessageTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ActivationMessageTests
{
    [Fact]
    public void FormatLink_ParseLink_RoundTrips()
    {
        var payload = ActivationMessage.FormatLink(DeepLinkBuilder.Build("Foo", newSession: true));
        var link = ActivationMessage.ParseLink(payload);
        Assert.NotNull(link);
        Assert.Equal("Foo", link!.Value.Project);
        Assert.True(link.Value.NewSession);
    }

    [Theory]
    [InlineData("ACTIVATE")]          // plain activation carries no link
    [InlineData("LINK not a uri")]    // garbage after prefix
    [InlineData("LINK ")]             // empty link
    [InlineData("")]
    [InlineData(null)]
    public void ParseLink_ReturnsNullForNonLinkPayloads(string? payload) =>
        Assert.Null(ActivationMessage.ParseLink(payload));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: FAIL — `ActivationMessage` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
namespace Ccmc.Core.Services;

/// <summary>
/// Payload protocol for the single-instance activation pipe.
/// "ACTIVATE" = bring the window forward; "LINK &lt;uri&gt;" = also launch the deep link.
/// </summary>
public static class ActivationMessage
{
    public const string Activate = "ACTIVATE";
    private const string LinkPrefix = "LINK ";

    public static string FormatLink(string uri) => LinkPrefix + uri;

    /// <summary>The deep link carried by the payload, or null for plain activation / malformed input.</summary>
    public static DeepLinkParser.DeepLink? ParseLink(string? payload)
    {
        if (payload is null || !payload.StartsWith(LinkPrefix, StringComparison.Ordinal)) return null;
        return DeepLinkParser.Parse(payload[LinkPrefix.Length..]);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/ActivationMessage.cs tests-net/Ccmc.Core.Tests/ActivationMessageTests.cs
git commit -m "feat(core): ActivationMessage pipe payload protocol"
```

---

### Task 3: ShellMenuComposer (Core)

**Files:**
- Create: `src/Ccmc.Core/Services/ShellMenuComposer.cs`
- Test: `tests-net/Ccmc.Core.Tests/ShellMenuComposerTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
using Ccmc.Core.Services;

namespace Ccmc.Core.Tests;

public class ShellMenuComposerTests
{
    [Fact]
    public void Compose_PinnedFirstThenRecents()
    {
        var entries = ShellMenuComposer.Compose(
            pinnedPaths: [@"C:\Dev\Pin1"],
            recentPaths: [@"C:\Dev\Rec1", @"C:\Dev\Rec2"],
            recentCap: 5);
        Assert.Equal(3, entries.Count);
        Assert.Equal("Pin1", entries[0].Label);
        Assert.True(entries[0].IsPinned);
        Assert.Equal("Rec1", entries[1].Label);
        Assert.False(entries[1].IsPinned);
    }

    [Fact]
    public void Compose_DedupesPinnedOutOfRecents_CaseInsensitive()
    {
        var entries = ShellMenuComposer.Compose(
            pinnedPaths: [@"C:\Dev\Foo"],
            recentPaths: [@"c:\dev\foo", @"C:\Dev\Bar"],
            recentCap: 5);
        Assert.Equal(2, entries.Count);
        Assert.Equal(@"C:\Dev\Foo", entries[0].Path);
        Assert.Equal("Bar", entries[1].Label);
    }

    [Fact]
    public void Compose_CapsRecents()
    {
        var recents = Enumerable.Range(1, 10).Select(i => $@"C:\Dev\R{i}");
        var entries = ShellMenuComposer.Compose([], recents, recentCap: 5);
        Assert.Equal(5, entries.Count);
        Assert.Equal("R1", entries[0].Label); // newest first preserved
    }

    [Fact]
    public void Compose_SkipsBlanksAndDuplicates_EmptyInputsYieldEmpty()
    {
        Assert.Empty(ShellMenuComposer.Compose([], [], 5));
        var entries = ShellMenuComposer.Compose(
            pinnedPaths: ["", @"C:\Dev\A", @"C:\Dev\A"],
            recentPaths: ["  "],
            recentCap: 5);
        Assert.Single(entries);
    }

    [Fact]
    public void Compose_LabelIsFolderName_TrailingSeparatorTolerated()
    {
        var entries = ShellMenuComposer.Compose([@"C:\Dev\My Project\"], [], 5);
        Assert.Equal("My Project", entries[0].Label);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: FAIL — `ShellMenuComposer` does not exist.

- [ ] **Step 3: Write the implementation**

```csharp
namespace Ccmc.Core.Services;

/// <summary>One entry in the tray menu / jump list. Label is the folder name.</summary>
public sealed record ShellMenuEntry(string Label, string Path, bool IsPinned);

/// <summary>
/// Single source of truth for the tray menu and the taskbar jump list:
/// pinned projects first (config order), then recents (newest first) minus
/// anything already pinned, capped at <c>recentCap</c>.
/// </summary>
public static class ShellMenuComposer
{
    public static IReadOnlyList<ShellMenuEntry> Compose(
        IEnumerable<string> pinnedPaths, IEnumerable<string> recentPaths, int recentCap)
    {
        var entries = new List<ShellMenuEntry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var p in pinnedPaths)
        {
            if (string.IsNullOrWhiteSpace(p) || !seen.Add(p)) continue;
            entries.Add(new ShellMenuEntry(LabelOf(p), p, IsPinned: true));
        }

        var recents = 0;
        foreach (var p in recentPaths)
        {
            if (recents >= recentCap) break;
            if (string.IsNullOrWhiteSpace(p) || !seen.Add(p)) continue;
            entries.Add(new ShellMenuEntry(LabelOf(p), p, IsPinned: false));
            recents++;
        }
        return entries;
    }

    private static string LabelOf(string path) =>
        System.IO.Path.GetFileName(System.IO.Path.TrimEndingDirectorySeparator(path));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.Core/Services/ShellMenuComposer.cs tests-net/Ccmc.Core.Tests/ShellMenuComposerTests.cs
git commit -m "feat(core): ShellMenuComposer shared tray/jump-list model"
```

---

### Task 4: CloseToTray state + Settings toggle

**Files:**
- Modify: `src/Ccmc.Core/Models/AppState.cs` (add property at end of class)
- Modify: `src/Ccmc.WinUI/ViewModels/MainViewModel.cs` (add property near `HandleDeepLink`, ~line 130)
- Modify: `src/Ccmc.WinUI/Views/SettingsDialog.xaml` (new grid row)
- Modify: `src/Ccmc.WinUI/Views/SettingsDialog.xaml.cs` (init + handler)

- [ ] **Step 1: Add the state property**

In `AppState.cs`, after the `SavedFilters` property:

```csharp
    /// <summary>When true, the window close button hides to the tray instead of exiting.</summary>
    public bool CloseToTray { get; set; }
```

(Default `false` per spec — bool default already false, no initializer needed. JSON round-trips automatically through `ConfigService.JsonOpts`.)

- [ ] **Step 2: Add the view-model property**

In `MainViewModel.cs` (place after the `HandleDeepLink` method):

```csharp
    /// <summary>Settings toggle: X hides to tray instead of exiting. Persisted immediately.</summary>
    public bool CloseToTray
    {
        get => _state.CloseToTray;
        set { _state.CloseToTray = value; _stateService.Save(_state); }
    }
```

- [ ] **Step 3: Add the Settings toggle UI**

In `SettingsDialog.xaml`: add a fifth row definition after the existing four:

```xml
            <RowDefinition Height="Auto"/>
```

and after the closing `</StackPanel>` of the "Default root" section (Grid.Row="3"), add:

```xml
        <ToggleSwitch x:Name="CloseToTrayToggle" Grid.Row="4"
                      Header="Close to tray"
                      AutomationProperties.AutomationId="CloseToTrayToggle"
                      Toggled="CloseToTrayToggle_Toggled"
                      ToolTipService.ToolTip="When on, the X button hides the window to the tray icon instead of exiting. Exit via the tray menu."/>
```

- [ ] **Step 4: Wire the code-behind**

In `SettingsDialog.xaml.cs` constructor, after the `FontCombo` lines:

```csharp
        CloseToTrayToggle.IsOn = _viewModel.CloseToTray;
```

New handler at the end of the class:

```csharp
    private void CloseToTrayToggle_Toggled(object sender, RoutedEventArgs e)
    {
        _viewModel.CloseToTray = CloseToTrayToggle.IsOn;
    }
```

- [ ] **Step 5: Build both projects, run tests**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.
Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Ccmc.Core/Models/AppState.cs src/Ccmc.WinUI/ViewModels/MainViewModel.cs src/Ccmc.WinUI/Views/SettingsDialog.xaml src/Ccmc.WinUI/Views/SettingsDialog.xaml.cs
git commit -m "feat: close-to-tray setting (default off)"
```

---

### Task 5: ProtocolRegistrar (WinUI)

**Files:**
- Create: `src/Ccmc.WinUI/Services/ProtocolRegistrar.cs`
- Modify: `src/Ccmc.WinUI/App.xaml.cs` (call in `OnLaunched` after the mutex check)

- [ ] **Step 1: Write the registrar**

```csharp
using Microsoft.Win32;

namespace Ccmc.App.Services;

/// <summary>
/// Registers the ccmc:// URL protocol for the current user, pointing at this exe.
/// Needed because the packaged-manifest registration does not apply to the
/// unpackaged publish (the daily driver). Idempotent and best-effort: a denied
/// registry write degrades copied links but must never take startup down.
/// </summary>
public static class ProtocolRegistrar
{
    public static void EnsureRegistered()
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (exe is null) return;
            var command = $"\"{exe}\" \"%1\"";
            using var root = Registry.CurrentUser.CreateSubKey(
                @"Software\Classes\" + Ccmc.Core.Services.DeepLinkParser.Scheme);
            root.SetValue(null, "URL:Claude Code Management Console");
            root.SetValue("URL Protocol", "");
            using var cmd = root.CreateSubKey(@"shell\open\command");
            // Skip the write when current — avoids churning the registry every launch.
            if (cmd.GetValue(null) as string != command)
                cmd.SetValue(null, command);
        }
        catch (Exception ex) when (ex is System.Security.SecurityException
                                       or UnauthorizedAccessException or IOException)
        {
        }
    }
}
```

- [ ] **Step 2: Call it at startup**

In `App.xaml.cs` `OnLaunched`, directly after the `state`/`OverrideResources` lines (only the primary instance reaches this point):

```csharp
        // Make ccmc:// live for the unpackaged publish; packaged installs are
        // covered by the appxmanifest and this write is harmlessly redundant.
        Services.ProtocolRegistrar.EnsureRegistered();
```

- [ ] **Step 3: Build**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/Ccmc.WinUI/Services/ProtocolRegistrar.cs src/Ccmc.WinUI/App.xaml.cs
git commit -m "feat(app): HKCU ccmc:// protocol registration at startup"
```

---

### Task 6: Argv deep links + pipe LINK forwarding

**Files:**
- Modify: `src/Ccmc.WinUI/App.xaml.cs` — `OnLaunched`, `TryActivateExistingInstance`, `RunActivationPipeServerAsync`

Current code reference: secondary instances call `TryActivateExistingInstance()` then `Exit()` (App.xaml.cs:69), the pipe server compares `message == "ACTIVATE"` (App.xaml.cs:154).

- [ ] **Step 1: Add an argv link helper**

Add to the `App` class:

```csharp
    /// <summary>The ccmc:// URI passed on the command line (unpackaged protocol launch), or null.</summary>
    private static string? GetLaunchUriFromArgs()
    {
        var args = Environment.GetCommandLineArgs();
        for (var i = 1; i < args.Length; i++)
            if (args[i].StartsWith(Ccmc.Core.Services.DeepLinkParser.Scheme + "://",
                                   StringComparison.OrdinalIgnoreCase))
                return args[i];
        return null;
    }
```

- [ ] **Step 2: Forward the link from a secondary instance**

Replace `TryActivateExistingInstance()` (the whole method) with:

```csharp
    private static void TryActivateExistingInstance(string? linkUri)
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(timeout: 1500);
            using var writer = new StreamWriter(client);
            writer.Write(linkUri is null
                ? Ccmc.Core.Services.ActivationMessage.Activate
                : Ccmc.Core.Services.ActivationMessage.FormatLink(linkUri));
            writer.Flush();
        }
        catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException)
        {
            // The mutex holder might be the old PowerShell launcher (no pipe
            // server). No XAML window exists in this process path, so a Win32
            // message box is the only available UI.
            _ = MessageBoxW(IntPtr.Zero, "Claude Code Management Console is already running.", "Claude Code Management Console", 0x40 /* MB_ICONINFORMATION */);
        }
    }
```

and update the call site in `OnLaunched`:

```csharp
        if (!createdNew)
        {
            // Another instance owns the mutex: hand it our deep link (if any),
            // ask it to come to the front, then exit.
            TryActivateExistingInstance(GetLaunchUriFromArgs());
            Exit();
            return;
        }
```

- [ ] **Step 3: Handle argv links in the primary instance**

In `OnLaunched`, directly after the existing `TryHandleProtocolActivation();` line:

```csharp
        // Unpackaged protocol/jump-list launch: the URI arrives via argv, not
        // WinRT activation args. Both paths converge on HandleDeepLink.
        if (GetLaunchUriFromArgs() is { } argUri &&
            Ccmc.Core.Services.DeepLinkParser.Parse(argUri) is { } argLink)
        {
            _window?.ViewModel.HandleDeepLink(argLink);
        }
```

- [ ] **Step 4: Parse LINK payloads in the pipe server**

In `RunActivationPipeServerAsync`, replace the `if (message == "ACTIVATE")` block with:

```csharp
                var link = Ccmc.Core.Services.ActivationMessage.ParseLink(message);
                if (link is not null || message == Ccmc.Core.Services.ActivationMessage.Activate)
                {
                    _window?.DispatcherQueue.TryEnqueue(() =>
                    {
                        if (_window is null) return;
                        if (link is { } dl) _window.ViewModel.HandleDeepLink(dl);
                        if (_window.AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } p)
                            p.Restore();
                        _window.AppWindow.Show(); // also restores a tray-hidden window
                        _window.Activate();
                    });
                }
```

(The added `AppWindow.Show()` matters once close-to-tray exists: a hidden window must reappear on activation. Malformed payloads — `link` null and not `ACTIVATE` — are ignored, per spec.)

- [ ] **Step 5: Build**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/Ccmc.WinUI/App.xaml.cs
git commit -m "feat(app): argv deep links + LINK forwarding over activation pipe"
```

---

### Task 7: TrayIconService (WinUI)

**Files:**
- Create: `src/Ccmc.WinUI/Services/TrayIconService.cs`

Pattern reference: `GlobalHotkey.cs` — WndProc subclass with saved old proc, fail-soft register, `IDisposable` restore. Two subclasses chain safely: each forwards to the proc it replaced.

- [ ] **Step 1: Write the service**

```csharp
using System.Runtime.InteropServices;
using Ccmc.Core.Services;

namespace Ccmc.App.Services;

/// <summary>
/// Always-visible notification-area icon. Left-click raises <see cref="ToggleRequested"/>;
/// right-click shows a native Win32 popup menu composed from <see cref="ShellMenuComposer"/>
/// entries (pinned, then recents, then Open / Exit). Subclasses the window's WndProc like
/// <see cref="GlobalHotkey"/>. Fail-soft: if Shell_NotifyIcon refuses the add, the app runs
/// without a tray icon. Re-adds itself when Explorer restarts (TaskbarCreated).
/// </summary>
public sealed class TrayIconService : IDisposable
{
    private const int WM_TRAYICON = 0x8000 + 0x1C;  // WM_APP + arbitrary app-unique offset
    private const int WM_LBUTTONUP = 0x0202, WM_RBUTTONUP = 0x0205;
    private const uint NIM_ADD = 0, NIM_DELETE = 2;
    private const uint NIF_MESSAGE = 0x1, NIF_ICON = 0x2, NIF_TIP = 0x4;
    private const uint TPM_RETURNCMD = 0x0100, TPM_RIGHTBUTTON = 0x0002;
    private const uint MF_STRING = 0x0, MF_SEPARATOR = 0x800, MF_GRAYED = 0x1;
    private const uint LR_LOADFROMFILE = 0x10, IMAGE_ICON = 1;
    private const int GWLP_WNDPROC = -4;

    private const int FirstProjectCommandId = 1000;
    private const int OpenCommandId = 2001;
    private const int ExitCommandId = 2002;
    private const int RecentCap = 5;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATAW
    {
        public uint cbSize;
        public IntPtr hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szTip;
        public uint dwState, dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string szInfo;
        public uint uTimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public IntPtr hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern bool Shell_NotifyIconW(uint dwMessage, ref NOTIFYICONDATAW lpData);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadImageW(IntPtr hInst, string name, uint type, int cx, int cy, uint fuLoad);
    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);
    [DllImport("user32.dll")]
    private static extern IntPtr CreatePopupMenu();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenuW(IntPtr hMenu, uint uFlags, nuint uIDNewItem, string? lpNewItem);
    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(IntPtr hMenu);
    [DllImport("user32.dll")]
    private static extern int TrackPopupMenuEx(IntPtr hMenu, uint uFlags, int x, int y, IntPtr hwnd, IntPtr lptpm);
    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern uint RegisterWindowMessageW(string lpString);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtrW(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll")]
    private static extern IntPtr CallWindowProcW(IntPtr lpPrevWndFunc, IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    private IntPtr _hwnd;
    private IntPtr _oldProc;
    private WndProcDelegate? _newProc;   // kept alive against GC
    private IntPtr _icon;
    private uint _taskbarCreatedMsg;
    private bool _added;
    private IReadOnlyList<ShellMenuEntry> _currentEntries = [];

    /// <summary>Returns the current pinned+recent entries; called fresh on every right-click.</summary>
    public Func<IReadOnlyList<ShellMenuEntry>>? EntriesProvider { get; set; }

    public event Action? ToggleRequested;
    public event Action? OpenRequested;
    public event Action? ExitRequested;
    public event Action<string>? LaunchRequested; // project path

    /// <summary>Adds the icon. Returns false (and leaves nothing behind) if the shell refuses.</summary>
    public bool Register(IntPtr hwnd)
    {
        _hwnd = hwnd;
        _taskbarCreatedMsg = RegisterWindowMessageW("TaskbarCreated");
        _icon = LoadIconHandle();
        if (_icon == IntPtr.Zero) return false;

        _newProc = HookProc;
        _oldProc = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, Marshal.GetFunctionPointerForDelegate(_newProc));

        _added = AddIcon();
        if (!_added)
        {
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, _oldProc);
            _oldProc = IntPtr.Zero;
            DestroyIcon(_icon);
            _icon = IntPtr.Zero;
        }
        return _added;
    }

    private static IntPtr LoadIconHandle()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (!File.Exists(path)) return IntPtr.Zero;
        return LoadImageW(IntPtr.Zero, path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);
    }

    private bool AddIcon()
    {
        var data = MakeData();
        data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        data.uCallbackMessage = WM_TRAYICON;
        data.hIcon = _icon;
        data.szTip = "Claude Code Management Console";
        return Shell_NotifyIconW(NIM_ADD, ref data);
    }

    private NOTIFYICONDATAW MakeData() => new()
    {
        cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATAW>(),
        hWnd = _hwnd,
        uID = 1,
        szTip = string.Empty,
        szInfo = string.Empty,
        szInfoTitle = string.Empty,
    };

    private IntPtr HookProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_TRAYICON)
        {
            switch (lParam.ToInt64() & 0xFFFF)
            {
                case WM_LBUTTONUP: ToggleRequested?.Invoke(); break;
                case WM_RBUTTONUP: ShowMenu(); break;
            }
        }
        else if (_taskbarCreatedMsg != 0 && msg == _taskbarCreatedMsg && _added)
        {
            AddIcon(); // Explorer restarted: the icon is gone; put it back
        }
        return CallWindowProcW(_oldProc, hWnd, msg, wParam, lParam);
    }

    private void ShowMenu()
    {
        var menu = CreatePopupMenu();
        if (menu == IntPtr.Zero) return;
        try
        {
            _currentEntries = EntriesProvider?.Invoke() ?? [];
            var anyPinned = false;
            var anyRecent = false;
            for (var i = 0; i < _currentEntries.Count; i++)
            {
                var e = _currentEntries[i];
                if (e.IsPinned) anyPinned = true;
                if (!e.IsPinned && anyPinned && !anyRecent)
                    AppendMenuW(menu, MF_SEPARATOR, 0, null); // pinned → recents divider
                if (!e.IsPinned) anyRecent = true;
                AppendMenuW(menu, MF_STRING, (nuint)(FirstProjectCommandId + i), e.Label);
            }
            if (_currentEntries.Count == 0)
                AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, "No recent projects");
            AppendMenuW(menu, MF_SEPARATOR, 0, null);
            AppendMenuW(menu, MF_STRING, OpenCommandId, "Open ccmc");
            AppendMenuW(menu, MF_STRING, ExitCommandId, "Exit");

            // Required by TrackPopupMenu: without foreground ownership the menu
            // won't dismiss when the user clicks elsewhere.
            SetForegroundWindow(_hwnd);
            GetCursorPos(out var pt);
            var cmd = TrackPopupMenuEx(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.X, pt.Y, _hwnd, IntPtr.Zero);

            if (cmd == OpenCommandId) OpenRequested?.Invoke();
            else if (cmd == ExitCommandId) ExitRequested?.Invoke();
            else if (cmd >= FirstProjectCommandId && cmd < FirstProjectCommandId + _currentEntries.Count)
                LaunchRequested?.Invoke(_currentEntries[cmd - FirstProjectCommandId].Path);
        }
        finally
        {
            DestroyMenu(menu);
        }
    }

    public void Dispose()
    {
        if (_added)
        {
            var data = MakeData();
            Shell_NotifyIconW(NIM_DELETE, ref data);
            _added = false;
        }
        if (_oldProc != IntPtr.Zero) { SetWindowLongPtrW(_hwnd, GWLP_WNDPROC, _oldProc); _oldProc = IntPtr.Zero; }
        if (_icon != IntPtr.Zero) { DestroyIcon(_icon); _icon = IntPtr.Zero; }
    }
}
```

- [ ] **Step 2: Build**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/Ccmc.WinUI/Services/TrayIconService.cs
git commit -m "feat(app): TrayIconService (Shell_NotifyIcon + TrackPopupMenu)"
```

---

### Task 8: Wire tray + close-to-tray into MainWindow

**Files:**
- Modify: `src/Ccmc.WinUI/MainWindow.xaml.cs` (constructor region, ~lines 25–70)
- Modify: `src/Ccmc.WinUI/ViewModels/MainViewModel.cs` (expose shell entries + launch-by-path)

- [ ] **Step 1: Expose shell-entry data and path-launch on the view model**

In `MainViewModel.cs`, after the `CloseToTray` property added in Task 4:

```csharp
    /// <summary>Current tray/jump-list entries (pinned first, then capped recents).</summary>
    public IReadOnlyList<ShellMenuEntry> ShellEntries(int recentCap) =>
        ShellMenuComposer.Compose(_state.Pinned, _state.RecentLaunches, recentCap);

    /// <summary>Raised whenever pins or recents change, so shell surfaces (jump list) can rebuild.</summary>
    public event Action? ShellEntriesChanged;

    /// <summary>Launches the project at <paramref name="path"/> (tray/jump-list entry). No-op if it vanished.</summary>
    public void LaunchByPath(string path)
    {
        var row = AllProjects.FirstOrDefault(p => string.Equals(p.Path, path, StringComparison.OrdinalIgnoreCase));
        if (row is null) { ToastRequested?.Invoke($"Project no longer found: {path}"); return; }
        _ = LaunchFromPaletteAsync(row, isNew: false);
    }
```

Raise the event from the two mutation sites:
- end of `PushRecent(string path)` (after `RebuildRecent();`): add `ShellEntriesChanged?.Invoke();`
- end of the `TogglePin` command body (after its existing save/refresh logic): add `ShellEntriesChanged?.Invoke();`

`ShellMenuComposer`/`ShellMenuEntry` need `using Ccmc.Core.Services;` — already imported in MainViewModel.

- [ ] **Step 2: Create and wire the tray icon in MainWindow**

In `MainWindow.xaml.cs`, add fields next to `_hotkey`:

```csharp
    private TrayIconService? _tray;
    private bool _reallyExit;
```

(`TrayIconService` lives in `Ccmc.App.Services` — same namespace style as `ContentDialogUserDialogs`; add `using Ccmc.App.Services;` if not present.)

In the constructor, after `RegisterGlobalHotkey();`:

```csharp
        RegisterTrayIcon();
```

Extend the existing `Closed` handler to dispose the tray:

```csharp
        Closed += (_, _) =>
        {
            _tray?.Dispose();
            _hotkey?.Dispose();
            ViewModel.Shutdown();
        };
```

(Replace the existing two-line handler body; same statements plus `_tray?.Dispose();` first.)

New method after `RegisterGlobalHotkey()`:

```csharp
    /// <summary>
    /// Adds the always-visible tray icon. Fail-soft like the global hotkey: if the
    /// shell refuses the icon, the app runs without it (close-to-tray still hides;
    /// the window comes back via relaunch-activate or the global hotkey).
    /// </summary>
    private void RegisterTrayIcon()
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        _tray = new TrayIconService
        {
            EntriesProvider = () => ViewModel.ShellEntries(recentCap: 5),
        };
        _tray.ToggleRequested += () => DispatcherQueue.TryEnqueue(ToggleWindowVisibility);
        _tray.OpenRequested += () => DispatcherQueue.TryEnqueue(ShowAndActivate);
        _tray.ExitRequested += () => DispatcherQueue.TryEnqueue(() => { _reallyExit = true; Close(); });
        _tray.LaunchRequested += path => DispatcherQueue.TryEnqueue(() => ViewModel.LaunchByPath(path));
        if (!_tray.Register(hwnd)) _tray = null;
    }

    private void ShowAndActivate()
    {
        if (AppWindow.Presenter is Microsoft.UI.Windowing.OverlappedPresenter { State: Microsoft.UI.Windowing.OverlappedPresenterState.Minimized } p)
            p.Restore();
        AppWindow.Show();
        Activate();
    }

    private void ToggleWindowVisibility()
    {
        if (AppWindow.IsVisible) AppWindow.Hide();
        else ShowAndActivate();
    }
```

- [ ] **Step 3: Close-to-tray interception**

In the constructor, after `ConfigureAppWindow();`:

```csharp
        AppWindow.Closing += (_, e) =>
        {
            // Settings toggle: X hides to the tray; the process (pipe server,
            // session detection, hotkey) stays alive. Tray "Exit" bypasses this.
            if (ViewModel.CloseToTray && !_reallyExit)
            {
                e.Cancel = true;
                AppWindow.Hide();
            }
        };
```

- [ ] **Step 4: Build and run a quick smoke**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.WinUI/MainWindow.xaml.cs src/Ccmc.WinUI/ViewModels/MainViewModel.cs
git commit -m "feat(app): tray icon wiring + close-to-tray interception"
```

---

### Task 9: JumpListService (WinUI)

**Files:**
- Create: `src/Ccmc.WinUI/Services/JumpListService.cs`
- Modify: `src/Ccmc.WinUI/MainWindow.xaml.cs` (rebuild triggers)

- [ ] **Step 1: Write the service**

```csharp
using System.Runtime.InteropServices;
using Ccmc.Core.Services;

namespace Ccmc.App.Services;

/// <summary>
/// Rebuilds the taskbar jump list ("Pinned" and "Recent" categories) via
/// ICustomDestinationList COM interop — the WinRT JumpList API needs package
/// identity, which the unpackaged publish lacks. Items are IShellLinks that
/// invoke this exe with the project's ccmc:// link as the argument, so they
/// work even if protocol registration failed. All failures are swallowed:
/// the previous jump list simply persists.
/// </summary>
public static class JumpListService
{
    private const int JumpListRecentCap = 8;

    public static void Rebuild(IReadOnlyList<ShellMenuEntry> entries)
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (exe is null) return;

            var list = (ICustomDestinationList)new DestinationList();
            var riid = typeof(IObjectArray).GUID;
            list.BeginList(out _, ref riid, out _);

            var pinned = entries.Where(e => e.IsPinned).ToList();
            var recent = entries.Where(e => !e.IsPinned).Take(JumpListRecentCap).ToList();
            AppendCategory(list, "Pinned", pinned, exe);
            AppendCategory(list, "Recent", recent, exe);

            list.CommitList();
        }
        catch (Exception)
        {
            // COM failures (shell policy, server busy) must never surface.
        }
    }

    private static void AppendCategory(ICustomDestinationList list, string name,
        IReadOnlyList<ShellMenuEntry> entries, string exe)
    {
        if (entries.Count == 0) return;
        var collection = (IObjectCollection)new EnumerableObjectCollection();
        foreach (var e in entries)
            collection.AddObject(MakeLink(exe, e));
        list.AppendCategory(name, (IObjectArray)collection);
    }

    private static IShellLinkW MakeLink(string exe, ShellMenuEntry entry)
    {
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(exe);
        link.SetArguments(DeepLinkBuilder.Build(entry.Label));
        link.SetDescription($"Launch Claude in {entry.Label}");
        link.SetIconLocation(exe, 0);

        // The visible title comes from PKEY_Title, not the description.
        var store = (IPropertyStore)link;
        var pkeyTitle = new PROPERTYKEY
        {
            fmtid = new Guid("F29F85E0-4FF9-1068-AB91-08002B27B3D9"),
            pid = 2,
        };
        var title = new PROPVARIANT(entry.Label);
        try
        {
            store.SetValue(ref pkeyTitle, ref title);
            store.Commit();
        }
        finally
        {
            title.Clear();
        }
        return link;
    }

    // ---------- COM interop ----------

    [ComImport, Guid("77F10CF0-3DB5-4966-B520-B7C54FD35ED6"), ClassInterface(ClassInterfaceType.None)]
    private class DestinationList { }

    [ComImport, Guid("2D3468C1-36A7-43B6-AC24-D3F02FD9607A"), ClassInterface(ClassInterfaceType.None)]
    private class EnumerableObjectCollection { }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046"), ClassInterface(ClassInterfaceType.None)]
    private class ShellLink { }

    [ComImport, Guid("6332DEBF-87B5-4670-90C0-5E57B408A49E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ICustomDestinationList
    {
        void SetAppID([MarshalAs(UnmanagedType.LPWStr)] string pszAppID);
        void BeginList(out uint pcMaxSlots, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        void AppendCategory([MarshalAs(UnmanagedType.LPWStr)] string pszCategory, IObjectArray poa);
        void AppendKnownCategory(int category);
        void AddUserTasks(IObjectArray poa);
        void CommitList();
        void GetRemovedDestinations(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        void DeleteList([MarshalAs(UnmanagedType.LPWStr)] string? pszAppID);
        void AbortList();
    }

    [ComImport, Guid("92CA9DCD-5622-4BBA-A805-5E9F541BD8C9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IObjectArray
    {
        void GetCount(out uint pcObjects);
        void GetAt(uint uiIndex, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport, Guid("5632B1A4-E38A-400A-928A-D4CD63230295"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IObjectCollection
    {
        // IObjectArray
        void GetCount(out uint pcObjects);
        void GetAt(uint uiIndex, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        // IObjectCollection
        void AddObject([MarshalAs(UnmanagedType.IUnknown)] object punk);
        void AddFromArray(IObjectArray poaSource);
        void RemoveObjectAt(uint uiIndex);
        void Clear();
    }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszFile, int cch, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out ushort pwHotkey);
        void SetHotkey(ushort wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] char[] pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPERTYKEY
    {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROPVARIANT
    {
        private ushort vt;
        private ushort r1, r2, r3;
        private IntPtr data;
        private IntPtr data2;

        public PROPVARIANT(string value)
        {
            vt = 31; // VT_LPWSTR
            r1 = r2 = r3 = 0;
            data = Marshal.StringToCoTaskMemUni(value);
            data2 = IntPtr.Zero;
        }

        public void Clear()
        {
            if (data != IntPtr.Zero) { Marshal.FreeCoTaskMem(data); data = IntPtr.Zero; }
        }
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PROPERTYKEY pkey);
        void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        void SetValue(ref PROPERTYKEY key, ref PROPVARIANT propvar);
        void Commit();
    }
}
```

- [ ] **Step 2: Trigger rebuilds from MainWindow**

In `MainWindow.xaml.cs` constructor, after `RegisterTrayIcon();`:

```csharp
        // Jump list mirrors the tray entries. Rebuild off the UI thread on every
        // pins/recents change; COM failures inside are swallowed.
        ViewModel.ShellEntriesChanged += () =>
            _ = Task.Run(() => JumpListService.Rebuild(ViewModel.ShellEntries(recentCap: 8)));
        _ = Task.Run(() => JumpListService.Rebuild(ViewModel.ShellEntries(recentCap: 8)));
```

> `ICustomDestinationList` requires an STA-or-MTA COM-initialized thread; .NET
> thread-pool threads are MTA-initialized, which this API accepts.

- [ ] **Step 3: Build**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/Ccmc.WinUI/Services/JumpListService.cs src/Ccmc.WinUI/MainWindow.xaml.cs
git commit -m "feat(app): taskbar jump list via ICustomDestinationList"
```

---

### Task 10: Copy deep link context-menu item

**Files:**
- Modify: `src/Ccmc.WinUI/ViewModels/MainViewModel.cs` (next to `CopyPath`, ~line 905)
- Modify: `src/Ccmc.WinUI/MainWindow.xaml` (project context menu, after "Copy path" at line 183)
- Modify: `src/Ccmc.WinUI/MainWindow.xaml.cs` (click handler next to `CopyPath_Click`, ~line 331)

- [ ] **Step 1: Add the command (mirrors the existing CopyPath command)**

```csharp
    [RelayCommand]
    private void CopyDeepLink(ProjectItemViewModel? project)
    {
        if (project is null) return;
        var package = new DataPackage();
        package.SetText(DeepLinkBuilder.Build(project.Name));
        Clipboard.SetContent(package);
        ToastRequested?.Invoke("Deep link copied to clipboard");
    }
```

- [ ] **Step 2: Add the menu item**

In `MainWindow.xaml`, directly after `<MenuFlyoutItem Text="Copy path" Click="CopyPath_Click"/>`:

```xml
                                            <MenuFlyoutItem Text="Copy deep link" Click="CopyDeepLink_Click"
                                                            ToolTipService.ToolTip="Copies a ccmc:// link that launches this project from anywhere"/>
```

- [ ] **Step 3: Add the click handler**

In `MainWindow.xaml.cs`, next to `CopyPath_Click`:

```csharp
    private void CopyDeepLink_Click(object sender, RoutedEventArgs e) =>
        ViewModel.CopyDeepLinkCommand.Execute(ItemOf(sender));
```

- [ ] **Step 4: Build and test**

Run: `dotnet build src/Ccmc.WinUI/Ccmc.WinUI.csproj -c Debug -p:Platform=x64 --nologo`
Expected: 0 errors.
Run: `dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/Ccmc.WinUI/ViewModels/MainViewModel.cs src/Ccmc.WinUI/MainWindow.xaml src/Ccmc.WinUI/MainWindow.xaml.cs
git commit -m "feat(app): copy-deep-link context menu item"
```

---

### Task 11: Publish + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Close any running ccmc instance, then publish**

```powershell
dotnet publish "src/Ccmc.WinUI" -c Release -r win-x64 -p:Platform=x64 -p:UnpackagedPublish=true -o publish
```
Expected: 0 errors, `publish\ccmc.exe` refreshed.

- [ ] **Step 2: Manual smoke checklist (run `publish\ccmc.exe`)**

Walk each item; all must hold:

1. Tray icon appears with the app icon and "Claude Code Management Console" tooltip.
2. Left-click tray icon hides the window; left-click again shows + activates it.
3. Right-click tray icon: pinned projects on top, separator, recents (max 5), separator, "Open ccmc", "Exit". Clicking a project launches a Claude session.
4. Settings → "Close to tray" OFF (default): X exits the process (tray icon disappears).
5. Toggle "Close to tray" ON: X hides the window, process stays (tray icon remains); tray "Exit" really exits.
6. `Win+R` → `ccmc://launch?project=<some-project-name>` → running instance comes forward and launches that project (HKCU registration + pipe LINK path).
7. Same `Win+R` link with the app NOT running → app starts and launches the project (argv path).
8. Right-click the taskbar icon: "Pinned" and "Recent" categories present; clicking an item launches the project.
9. Project context menu → "Copy deep link" → paste shows `ccmc://launch?project=<name>`.
10. `taskkill /f /im explorer.exe & start explorer` → tray icon survives (TaskbarCreated re-add).

- [ ] **Step 3: Run full test suite one final time**

```powershell
dotnet test tests-net/Ccmc.Core.Tests/Ccmc.Core.Tests.csproj -p:Platform=x64 --nologo
```
Expected: PASS, 0 failed.

- [ ] **Step 4: Final commit if smoke fixes were needed; otherwise done**

Use the superpowers:finishing-a-development-branch skill to merge `feat/shell-integration`.
