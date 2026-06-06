# WinUI 3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Workers also need: `winui:winui-dev-workflow` (build/run loop), `winui:winui-design` (XAML rules).

**Goal:** Port the Dev-Projects launcher from WPF (.NET 9 Fluent) to WinUI 3 (Windows App SDK), preserving every feature: project list with pin/git/live badges, per-project flags, drag-drop, dialogs, single-instance activation, theme switching, keyboard shortcuts.

**Architecture:** New project `src/DevProjects.WinUI` (RootNamespace stays `DevProjects.App`) referencing the untouched `DevProjects.Core`. The WPF `Dispatcher` becomes `DispatcherQueue`; `MessageBox` becomes an injected `IUserDialogs` (ContentDialog); the 4 modal Windows become ContentDialogs; HelpWindow stays a Window. The old WPF project is removed at the end.

**Tech Stack:** .NET 9, Windows App SDK (latest, ≥1.8), WinUI 3, CommunityToolkit.Mvvm 8.4.2, `Microsoft.Windows.Storage.Pickers` for the folder picker.

**Task order rationale:** Tasks 2–7 build leaf-first (services → viewmodels → dialogs → help) so every task ends with a green build; Task 8 (MainWindow) wires them together and is the first runnable milestone; Task 9 adds startup behavior; Task 10 cuts over.

**Verification model:** `DevProjects.Core` unit tests (`dotnet test`) must stay green after every task. UI tasks are verified by building and by `winapp run` smoke checks (no UI unit-test harness exists in this repo; parity with the WPF app, which also had none). TDD applies only where logic is extracted — the port itself is verified behaviorally.

**Key API mappings (reference for every task):**

| WPF | WinUI 3 |
|---|---|
| `System.Windows.*` usings | `Microsoft.UI.Xaml`, `Microsoft.UI.Xaml.Controls`, `Microsoft.UI.Xaml.Input` |
| `Dispatcher` / `DispatcherTimer` | `Microsoft.UI.Dispatching.DispatcherQueue` / `.CreateTimer()` |
| `dispatcher.InvokeAsync/BeginInvoke` | `dispatcherQueue.TryEnqueue(...)` |
| `MessageBox.Show` | `IUserDialogs` (ContentDialog, async) |
| `Clipboard.SetText` | `DataPackage` + `Windows.ApplicationModel.DataTransfer.Clipboard.SetContent` |
| `Application.Current.ThemeMode` | `RootGrid.RequestedTheme` (ElementTheme) |
| `Window.InputBindings` + `RoutedCommand` | `KeyboardAccelerator` + code-behind handlers |
| Modal `Window` + `ShowDialog()` | `ContentDialog` + `ShowAsync()` (needs `XamlRoot`) |
| `OpenFolderDialog` (Microsoft.Win32) | `Microsoft.Windows.Storage.Pickers.FolderPicker(windowId)` |
| WPF drag-drop (`DataFormats.FileDrop`) | `AllowDrop` on root Grid, `e.DataView.Contains(StandardDataFormats.StorageItems)`, async `GetStorageItemsAsync()` |
| `BooleanToVisibilityConverter` | `x:Bind` implicit bool→Visibility |
| Watermark TextBlock overlay | `TextBox.PlaceholderText` |
| `RelativeSource AncestorType` bindings | NOT SUPPORTED — Click handlers in code-behind, item via `((FrameworkElement)sender).DataContext` |
| `ContextMenu` | `ContextFlyout` + `MenuFlyout` (inherits item DataContext from target) |
| `ToolTipService.ShowOnDisabled` | NOT SUPPORTED — put tooltip on enabled parent container |

**Critical rules (from winui-wpf-migration):** never reference `PresentationCore`/`PresentationFramework`, never add `<UseWPF>true</UseWPF>`, never delete `Package.appxmanifest`, merge (don't overwrite) template `App.xaml.cs`, launch with `winapp run`.

**WinUI gotchas baked into this plan:**
- Only ONE ContentDialog may be open at a time per XamlRoot. All dialog error paths therefore surface inline (ValidationText) instead of nested MessageBoxes.
- Window-level KeyboardAccelerators still fire while a ContentDialog is open → every accelerator handler guards on `DialogGate.AnyOpen`.
- Style setters cannot bind in WinUI → sidebar per-item `IsEnabled`/ToolTip set in `ContainerContentChanging`.
- The drop target Grid MUST have a `Background` (even Transparent) or drop events never fire.
- `AppWindow.Resize` takes physical pixels — multiply by DPI scale.

---

### Task 1: Scaffold the WinUI 3 project

**Files:**
- Create: `src/DevProjects.WinUI/` (via template)
- Modify: `src/DevProjects.WinUI/DevProjects.WinUI.csproj`
- Modify: `DevProjects.sln` (via `dotnet sln add`)

- [ ] **Step 1: Generate the project**

```powershell
dotnet new winui-mvvm -n DevProjects.WinUI -o "src/DevProjects.WinUI"
```

- [ ] **Step 2: Align namespace, assembly name, references**

Open `src/DevProjects.WinUI/DevProjects.WinUI.csproj`. Inside the first `<PropertyGroup>` add/replace (keep all template properties you don't recognize — especially packaging/manifest ones):

```xml
<RootNamespace>DevProjects.App</RootNamespace>
<AssemblyName>Dev-Projects</AssemblyName>
<Version>3.0.0</Version>
```

Add item groups:

```xml
<ItemGroup>
  <PackageReference Include="CommunityToolkit.Mvvm" Version="8.4.2" />
</ItemGroup>
<ItemGroup>
  <ProjectReference Include="..\DevProjects.Core\DevProjects.Core.csproj" />
</ItemGroup>
<ItemGroup>
  <Content Include="Assets\app.ico">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </Content>
</ItemGroup>
```

If the template already added a CommunityToolkit.Mvvm reference, keep one entry only.

- [ ] **Step 3: Copy the app icon**

```powershell
Copy-Item "src/DevProjects.App/Assets/app.ico" "src/DevProjects.WinUI/Assets/app.ico"
```

- [ ] **Step 4: Fix x:Class namespaces in template files**

The template generated classes under namespace `DevProjects.WinUI`; `RootNamespace` is now `DevProjects.App`. In EVERY generated `.xaml` and `.cs` file (`App.xaml`, `App.xaml.cs`, `MainWindow.xaml`, `MainWindow.xaml.cs`, plus any template `Views/`/`ViewModels/` files), replace namespace `DevProjects.WinUI` with `DevProjects.App` (x:Class, `namespace` declarations, `using DevProjects.WinUI...` lines, and `xmlns:local="using:DevProjects.WinUI"`).

- [ ] **Step 5: Delete template sample content**

Delete any template-generated sample pages/viewmodels NOT in this list (keep: `App.xaml(.cs)`, `MainWindow.xaml(.cs)`, `Package.appxmanifest`, `Assets/`, `app.manifest`, `launchSettings.json`, csproj). If `MainWindow.xaml` references a deleted sample page, strip its content down to an empty `<Grid/>` for now (Task 8 replaces it wholesale).

- [ ] **Step 6: Add to solution + build + run**

```powershell
dotnet sln add "src/DevProjects.WinUI" --solution-folder src
dotnet build "src/DevProjects.WinUI" -p:Platform=x64
```

Expected: build succeeds. Then smoke-run (empty window appears, close it):

```powershell
winapp run --project "src/DevProjects.WinUI"
```

(If `winapp run` syntax differs, consult winui:winui-dev-workflow; a `BuildAndRun.ps1` per that skill is also acceptable.)

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "feat: scaffold WinUI 3 project DevProjects.WinUI"
```

---

### Task 2: Copy platform-neutral app pieces

**Files:**
- Create: `src/DevProjects.WinUI/Services/SessionLauncher.cs` (copy verbatim from `src/DevProjects.App/Services/SessionLauncher.cs` — it has zero WPF dependencies)
- Create: `src/DevProjects.WinUI/ViewModels/SidebarItemViewModel.cs` (copy verbatim from `src/DevProjects.App/ViewModels/SidebarItemViewModel.cs`)
- Create: `src/DevProjects.WinUI/ViewModels/ProjectItemViewModel.cs` (copy from `src/DevProjects.App/ViewModels/ProjectItemViewModel.cs`, then apply the edit below)

- [ ] **Step 1: Copy the three files** (preserve content exactly; namespaces already match `DevProjects.App.*`).

- [ ] **Step 2: Add pin-glyph computed properties to ProjectItemViewModel**

In the copied `ProjectItemViewModel.cs`, replace:

```csharp
    [ObservableProperty]
    private bool _isPinned;
```

with:

```csharp
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PinGlyph))]
    [NotifyPropertyChangedFor(nameof(PinOpacity))]
    private bool _isPinned;

    /// <summary>Segoe Fluent glyph: FavoriteStarFill (E735) when pinned, FavoriteStar (E734) otherwise.</summary>
    public string PinGlyph => IsPinned ? "" : "";

    public double PinOpacity => IsPinned ? 1.0 : 0.55;
```

(The existing `partial void OnIsPinnedChanged` that raises `PinToolTip` stays.)

- [ ] **Step 3: Build**

```powershell
dotnet build "src/DevProjects.WinUI" -p:Platform=x64
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/DevProjects.WinUI; git commit -m "feat: port platform-neutral services and item viewmodels"
```

---

### Task 3: Dialog service + dialog gate

**Files:**
- Create: `src/DevProjects.WinUI/Services/IUserDialogs.cs`
- Create: `src/DevProjects.WinUI/Services/DialogGate.cs`
- Create: `src/DevProjects.WinUI/Services/ContentDialogUserDialogs.cs`

- [ ] **Step 1: Write IUserDialogs.cs**

```csharp
namespace DevProjects.App.Services;

/// <summary>UI-thread message/confirm dialogs, abstracted so the ViewModel stays testable.</summary>
public interface IUserDialogs
{
    Task ShowMessageAsync(string title, string message);
    Task<bool> ConfirmAsync(string title, string message, string confirmText = "Yes", string cancelText = "Cancel");
}
```

- [ ] **Step 2: Write DialogGate.cs**

```csharp
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Services;

/// <summary>
/// Routes every ContentDialog through one place so (a) we never open two at
/// once (WinUI throws) and (b) window-level keyboard accelerators can no-op
/// while a dialog is open (they would otherwise still fire underneath it).
/// </summary>
internal static class DialogGate
{
    private static int _openCount;

    public static bool AnyOpen => _openCount > 0;

    public static async Task<ContentDialogResult> ShowAsync(ContentDialog dialog)
    {
        if (AnyOpen) return ContentDialogResult.None; // refuse to stack
        _openCount++;
        try { return await dialog.ShowAsync(); }
        finally { _openCount--; }
    }
}
```

- [ ] **Step 3: Write ContentDialogUserDialogs.cs**

```csharp
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Services;

/// <summary>ContentDialog-backed IUserDialogs. XamlRoot is resolved lazily because it is null until the window content loads.</summary>
public sealed class ContentDialogUserDialogs(Func<XamlRoot> xamlRootProvider) : IUserDialogs
{
    public async Task ShowMessageAsync(string title, string message)
    {
        var dialog = new ContentDialog
        {
            XamlRoot = xamlRootProvider(),
            Title = title,
            Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
            CloseButtonText = "OK",
            DefaultButton = ContentDialogButton.Close,
        };
        await DialogGate.ShowAsync(dialog);
    }

    public async Task<bool> ConfirmAsync(string title, string message, string confirmText = "Yes", string cancelText = "Cancel")
    {
        var dialog = new ContentDialog
        {
            XamlRoot = xamlRootProvider(),
            Title = title,
            Content = new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap },
            PrimaryButtonText = confirmText,
            CloseButtonText = cancelText,
            DefaultButton = ContentDialogButton.Primary,
        };
        return await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary;
    }
}
```

- [ ] **Step 4: Build** — `dotnet build "src/DevProjects.WinUI" -p:Platform=x64` → PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/DevProjects.WinUI/Services; git commit -m "feat: ContentDialog-backed user dialog service with single-dialog gate"
```

---

### Task 4: Port MainViewModel

**Files:**
- Create: `src/DevProjects.WinUI/ViewModels/MainViewModel.cs`

Start from a copy of `src/DevProjects.App/ViewModels/MainViewModel.cs` and apply ALL of the following. (The unchanged ~70% — scan/filter/sort, flags persistence, pins, watchers, enrichment internals — stays byte-identical; only threading, dialogs, clipboard, and theme change.)

- [ ] **Step 1: Replace usings and fields**

Replace:
```csharp
using System.Windows;
using System.Windows.Threading;
```
with:
```csharp
using Microsoft.UI.Dispatching;
using Windows.ApplicationModel.DataTransfer;
```

Replace the field declarations:
```csharp
    private readonly Dispatcher _dispatcher;
    private readonly DispatcherTimer _watcherDebounce;
    ...
    private readonly DispatcherTimer _flagsSaveDebounce;
    private DispatcherTimer _runningRefreshTimer = null!;
```
with:
```csharp
    private readonly DispatcherQueue _dispatcherQueue;
    private readonly IUserDialogs _dialogs;
    private readonly DispatcherQueueTimer _watcherDebounce;
    ...
    private readonly DispatcherQueueTimer _flagsSaveDebounce;
    private DispatcherQueueTimer _runningRefreshTimer = null!;
```

- [ ] **Step 2: Add theme event** (next to `ToastRequested`):

```csharp
    /// <summary>Raised when the user picks a theme; the window applies it to its root element.</summary>
    public event Action<string>? ThemeChangeRequested;
```

- [ ] **Step 3: Rewrite the constructor head and timers**

```csharp
    public MainViewModel(
        DispatcherQueue dispatcherQueue,
        IUserDialogs dialogs,
        ConfigService? configService = null,
        StateService? stateService = null,
        IClaudeSessionDetector? sessionDetector = null)
    {
        _dispatcherQueue = dispatcherQueue;
        _dialogs = dialogs;
        _configService = configService ?? new ConfigService();
        _stateService = stateService ?? new StateService();
        _sessionDetector = sessionDetector ?? new ClaudeSessionDetector();
        _gitInfoProvider = new GitInfoProvider();
        _claudeCli = new ClaudeCliService();

        _watcherDebounce = dispatcherQueue.CreateTimer();
        _watcherDebounce.Interval = TimeSpan.FromMilliseconds(1500);
        _watcherDebounce.IsRepeating = false;
        _watcherDebounce.Tick += (_, _) => Rescan();

        // Live-session indicator refresh: cheap mtime probes every 30 s.
        _runningRefreshTimer = dispatcherQueue.CreateTimer();
        _runningRefreshTimer.Interval = TimeSpan.FromSeconds(30);
        _runningRefreshTimer.IsRepeating = true;
        _runningRefreshTimer.Tick += (_, _) => RefreshRunningStates();
        _runningRefreshTimer.Start();

        // Flags persist debounced so typing doesn't rewrite config.json per keystroke.
        _flagsSaveDebounce = dispatcherQueue.CreateTimer();
        _flagsSaveDebounce.Interval = TimeSpan.FromMilliseconds(500);
        _flagsSaveDebounce.IsRepeating = false;
        _flagsSaveDebounce.Tick += (_, _) => FlushPendingFlagsSave();
```
(rest of ctor body unchanged: load config/state, Theme/SortMode/ShowOnboarding/ClaudeMissing, `Rescan()`, `LoadClaudeVersionAsync`.)

- [ ] **Step 4: Enrichment loop — replace the `await _dispatcher.InvokeAsync(...)` block**

Inside `StartEnrichment`'s `foreach`, replace the `await _dispatcher.InvokeAsync(() => {...}, DispatcherPriority.Background, ct);` call with:

```csharp
                    _dispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () =>
                    {
                        // Re-check on the UI thread so a stale pass never
                        // writes to rows a newer filter already replaced.
                        if (ct.IsCancellationRequested) return;
                        row.HasSession = hasSession;
                        if (git is not null)
                        {
                            row.GitBranch = git.Branch;
                            row.GitDirty = git.IsDirty;
                        }
                    });
```

- [ ] **Step 5: RefreshRunningStates — replace `_dispatcher.BeginInvoke(...)`**

```csharp
            _dispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () =>
            {
                if (ct.IsCancellationRequested) return;
                foreach (var (row, isRunning) in results)
                    row.IsRunning = isRunning;
                UpdateRunningSummary();
            });
```

- [ ] **Step 6: RebuildWatchers — replace both `_dispatcher.BeginInvoke(...)` calls**

Each becomes `_dispatcherQueue.TryEnqueue(...)` with the same lambda body (stop+start `_watcherDebounce`).

- [ ] **Step 7: OnThemeChanged — remove WPF ThemeMode, raise event**

```csharp
    partial void OnThemeChanged(string value)
    {
        ThemeChangeRequested?.Invoke(value);
        _state.Theme = value;
        _stateService.Save(_state);
    }
```

- [ ] **Step 8: Launch paths become async with IUserDialogs**

Replace `LaunchNew`/`LaunchContinue`/`Launch` with:

```csharp
    [RelayCommand]
    private Task LaunchNewAsync(ProjectItemViewModel? project) => LaunchAsync(project, continueSession: false);

    [RelayCommand]
    private Task LaunchContinueAsync(ProjectItemViewModel? project) => LaunchAsync(project, continueSession: true);

    private async Task LaunchAsync(ProjectItemViewModel? project, bool continueSession)
    {
        if (project is null) return;
        FlushPendingFlagsSave();
        if (!LaunchCommandBuilder.AreFlagsSafe(project.Flags))
        {
            await _dialogs.ShowMessageAsync("Dev-Projects", LaunchCommandBuilder.UnsafeFlagMessage);
            return;
        }
        var spec = LaunchCommandBuilder.Build(project.Name, project.Path, project.Flags, continueSession);
        try
        {
            SessionLauncher.Launch(spec);
        }
        catch (Exception ex)
        {
            await _dialogs.ShowMessageAsync("Dev-Projects", $"Launch failed: {ex.Message}");
            return;
        }
        _configService.UpdateUsage(_config, project.Path, project.Flags);
        _allProjects = ProjectScanner.Scan(_config);
        ApplyFilter();
        SelectedProject = Projects.FirstOrDefault(p =>
            string.Equals(p.Path, project.Path, StringComparison.OrdinalIgnoreCase));
        ToastRequested?.Invoke(continueSession
            ? $"Continuing Claude session in “{project.Name}”"
            : $"Opened a new Claude session in “{project.Name}”");
    }
```

(Toolkit naming: `LaunchNewAsync` still generates `LaunchNewCommand` / `LaunchContinueCommand` — XAML/code-behind names unchanged.)

`LaunchInFolder` becomes:

```csharp
    /// <summary>One-off launch in a folder that is not a tracked project (drag-drop).</summary>
    public async Task LaunchInFolderAsync(string folderPath)
    {
        var name = Path.GetFileName(folderPath.TrimEnd('\\', '/'));
        var spec = LaunchCommandBuilder.Build(name, folderPath, flags: "", continueSession: false);
        try
        {
            SessionLauncher.Launch(spec);
            ToastRequested?.Invoke($"Opened a new Claude session in “{name}”");
        }
        catch (Exception ex)
        {
            await _dialogs.ShowMessageAsync("Dev-Projects", $"Launch failed: {ex.Message}");
        }
    }
```

- [ ] **Step 9: CopyPath — WinRT clipboard**

```csharp
    [RelayCommand]
    private void CopyPath(ProjectItemViewModel? project)
    {
        if (project is null) return;
        var package = new DataPackage();
        package.SetText(project.Path);
        Clipboard.SetContent(package);
        ToastRequested?.Invoke("Path copied to clipboard");
    }
```

(`Clipboard` here is `Windows.ApplicationModel.DataTransfer.Clipboard` via the using added in Step 1.)

- [ ] **Step 10: MoveSelectedToRoot becomes async**

```csharp
    [RelayCommand]
    private async Task MoveSelectedToRootAsync(string? targetRoot)
    {
        var project = SelectedProject;
        if (project is null || targetRoot is null) return;
        if (string.Equals(project.Root.TrimEnd('\\', '/'), targetRoot.TrimEnd('\\', '/'),
                StringComparison.OrdinalIgnoreCase))
        {
            ToastRequested?.Invoke("Project is already in that root");
            return;
        }

        var confirmed = await _dialogs.ConfirmAsync(
            "Move project",
            $"Move “{project.Name}” to {targetRoot}?\n\n" +
            "Note: Claude session history is tied to the folder path, so the Continue " +
            "button will start fresh after the move (the old transcripts are not deleted).",
            confirmText: "Move");
        if (!confirmed) return;

        string newPath;
        try
        {
            newPath = ProjectMover.MoveToRoot(project.Path, targetRoot);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or DirectoryNotFoundException)
        {
            await _dialogs.ShowMessageAsync("Move project",
                $"Could not move the project: {ex.Message}\n\n" +
                "If a Claude session or another program has files open in this folder, close it and try again.");
            return;
        }
        FinishRelocation(project.Path, newPath);
        ToastRequested?.Invoke($"Moved “{project.Name}” to {Path.GetFileName(targetRoot.TrimEnd('\\', '/'))}");
    }
```

- [ ] **Step 11: FinishRelocation — fire-and-forget warning dialog**

In the `catch` block of `FinishRelocation`, replace the `MessageBox.Show(...)` with:

```csharp
            _ = _dialogs.ShowMessageAsync("Dev-Projects",
                "The folder was moved, but its saved settings (flags/pin) could not be updated: "
                + ex.Message);
```

- [ ] **Step 12: Build + Core tests**

```powershell
dotnet build "src/DevProjects.WinUI" -p:Platform=x64
dotnet test
```

Expected: build PASS, all Core tests PASS.

- [ ] **Step 13: Commit**

```powershell
git add src/DevProjects.WinUI/ViewModels/MainViewModel.cs
git commit -m "feat: port MainViewModel to DispatcherQueue and async dialogs"
```

---

### Task 5: NewProjectDialog + RenameProjectDialog (ContentDialogs)

**Files:**
- Create: `src/DevProjects.WinUI/Views/NewProjectDialog.xaml` + `.xaml.cs`
- Create: `src/DevProjects.WinUI/Views/RenameProjectDialog.xaml` + `.xaml.cs`

All error paths surface in the inline ValidationText (a second ContentDialog cannot stack). These compile standalone (they depend only on Tasks 2 & 4); UI smoke happens in Task 8.

- [ ] **Step 1: NewProjectDialog.xaml**

```xml
<ContentDialog x:Class="DevProjects.App.Views.NewProjectDialog"
               xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
               xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
               Title="New Project"
               PrimaryButtonText="Create"
               CloseButtonText="Cancel"
               DefaultButton="Primary"
               PrimaryButtonClick="OnCreateClick">
    <StackPanel MinWidth="400" Spacing="4">
        <TextBlock Text="Project name"/>
        <TextBox x:Name="NameBox" AutomationProperties.AutomationId="NewProjectNameBox"
                 TextChanged="NameBox_TextChanged"
                 ToolTipService.ToolTip="The folder name for your new project. Letters, numbers, spaces and dashes are all fine."/>
        <TextBlock x:Name="ValidationText" Style="{StaticResource CaptionTextBlockStyle}"
                   Foreground="{ThemeResource SystemFillColorCriticalBrush}"
                   TextWrapping="Wrap" Text=" " Margin="0,0,0,4"/>
        <TextBlock Text="Create in"/>
        <ComboBox x:Name="RootCombo" HorizontalAlignment="Stretch" Margin="0,0,0,8"
                  AutomationProperties.AutomationId="NewProjectRootCombo"
                  ToolTipService.ToolTip="Which source root the new project folder is created under"/>
        <CheckBox x:Name="LaunchCheck" Content="Start a Claude session after creating" IsChecked="True"
                  ToolTipService.ToolTip="Opens a Windows Terminal tab running claude in the new folder as soon as it is created"/>
    </StackPanel>
</ContentDialog>
```

- [ ] **Step 2: NewProjectDialog.xaml.cs**

```csharp
using System.IO;
using DevProjects.App.ViewModels;
using DevProjects.Core.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

public sealed partial class NewProjectDialog : ContentDialog
{
    private readonly MainViewModel _viewModel;

    public NewProjectDialog(MainViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;

        var existingRoots = (_viewModel.Config.Roots ?? []).Where(Directory.Exists).ToList();
        RootCombo.ItemsSource = existingRoots;
        var preselect = _viewModel.PreferredNewProjectRoot;
        if (preselect is not null && existingRoots.Contains(preselect, StringComparer.OrdinalIgnoreCase))
            RootCombo.SelectedItem = existingRoots.First(r => string.Equals(r, preselect, StringComparison.OrdinalIgnoreCase));
        else if (existingRoots.Count > 0)
            RootCombo.SelectedIndex = 0;

        Loaded += (_, _) => NameBox.Focus(FocusState.Programmatic);
    }

    private void NameBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        // Live validation feedback while typing.
        if (RootCombo.SelectedItem is not string root)
        {
            ValidationText.Text = "No destination root available — add one in Settings first.";
            return;
        }
        var error = string.IsNullOrEmpty(NameBox.Text)
            ? null
            : ProjectNameValidator.GetError(NameBox.Text, root);
        ValidationText.Text = error ?? " ";
    }

    private void OnCreateClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        if (RootCombo.SelectedItem is not string root)
        {
            ValidationText.Text = "No destination root available — add one in Settings first.";
            args.Cancel = true;
            return;
        }
        var name = NameBox.Text.Trim();
        var error = ProjectNameValidator.GetError(name, root);
        if (error is not null)
        {
            ValidationText.Text = error;
            args.Cancel = true;
            return;
        }

        string newPath;
        try
        {
            newPath = _viewModel.CreateProject(root, name);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or DirectoryNotFoundException)
        {
            ValidationText.Text = $"Could not create folder: {ex.Message}";
            args.Cancel = true;
            return;
        }

        _viewModel.SelectProjectByPath(newPath);
        if (LaunchCheck.IsChecked == true)
            _viewModel.LaunchNewCommand.Execute(
                _viewModel.Projects.FirstOrDefault(p =>
                    string.Equals(p.Path, newPath, StringComparison.OrdinalIgnoreCase)));
    }
}
```

- [ ] **Step 3: RenameProjectDialog.xaml**

```xml
<ContentDialog x:Class="DevProjects.App.Views.RenameProjectDialog"
               xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
               xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
               Title="Rename Project"
               PrimaryButtonText="Rename"
               CloseButtonText="Cancel"
               DefaultButton="Primary"
               PrimaryButtonClick="OnRenameClick">
    <StackPanel MinWidth="400" Spacing="4">
        <TextBlock x:Name="CurrentText" TextWrapping="Wrap" Margin="0,0,0,8"/>
        <TextBlock Text="New name"/>
        <TextBox x:Name="NameBox" AutomationProperties.AutomationId="RenameNameBox"
                 TextChanged="NameBox_TextChanged"
                 ToolTipService.ToolTip="The new folder name. Letters, numbers, spaces and dashes are all fine."/>
        <TextBlock x:Name="ValidationText" Style="{StaticResource CaptionTextBlockStyle}"
                   Foreground="{ThemeResource SystemFillColorCriticalBrush}"
                   TextWrapping="Wrap" Text=" " Margin="0,0,0,4"/>
        <TextBlock TextWrapping="Wrap" Opacity="0.65" Style="{StaticResource CaptionTextBlockStyle}"
                   Text="Note: Claude session history is tied to the folder path, so Continue will start fresh after renaming (old transcripts are not deleted). Close any session running in this folder first."/>
    </StackPanel>
</ContentDialog>
```

- [ ] **Step 4: RenameProjectDialog.xaml.cs**

```csharp
using System.IO;
using DevProjects.App.ViewModels;
using DevProjects.Core.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

public sealed partial class RenameProjectDialog : ContentDialog
{
    private readonly MainViewModel _viewModel;
    private readonly ProjectItemViewModel _project;
    private readonly string _parentDir;

    public RenameProjectDialog(MainViewModel viewModel, ProjectItemViewModel project)
    {
        InitializeComponent();
        _viewModel = viewModel;
        _project = project;
        _parentDir = Path.GetDirectoryName(project.Path.TrimEnd('\\', '/')) ?? project.Root;

        CurrentText.Text = $"Renaming “{project.Name}” in {_parentDir}";
        NameBox.Text = project.Name;
        Loaded += (_, _) =>
        {
            NameBox.Focus(FocusState.Programmatic);
            NameBox.SelectAll();
        };
    }

    private void NameBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        var name = NameBox.Text;
        if (string.IsNullOrEmpty(name) || name.Trim() == _project.Name)
        {
            ValidationText.Text = " ";
            return;
        }
        ValidationText.Text = ProjectNameValidator.GetError(name, _parentDir) ?? " ";
    }

    private void OnRenameClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var name = NameBox.Text.Trim();
        if (name == _project.Name) return; // close as a no-op
        var error = ProjectNameValidator.GetError(name, _parentDir);
        if (error is not null)
        {
            ValidationText.Text = error;
            args.Cancel = true;
            return;
        }

        try
        {
            _viewModel.RenameProject(_project, name);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            ValidationText.Text = $"Could not rename: {ex.Message} " +
                "If a Claude session or another program has files open in this folder, close it and try again.";
            args.Cancel = true;
        }
    }
}
```

- [ ] **Step 5: Build** — `dotnet build "src/DevProjects.WinUI" -p:Platform=x64` → PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/DevProjects.WinUI/Views; git commit -m "feat: port New Project and Rename dialogs to ContentDialog"
```

---

### Task 6: SettingsDialog (ContentDialog + FolderPicker)

**Files:**
- Create: `src/DevProjects.WinUI/Views/SettingsDialog.xaml` + `.xaml.cs`

- [ ] **Step 1: SettingsDialog.xaml**

```xml
<ContentDialog x:Class="DevProjects.App.Views.SettingsDialog"
               xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
               xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
               Title="Settings"
               CloseButtonText="Close"
               DefaultButton="Close">
    <Grid MinWidth="460" RowSpacing="12">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*" MinHeight="180"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <TextBlock Grid.Row="0" Text="Source roots"
                   ToolTipService.ToolTip="Folders scanned for projects. Each direct subfolder shows up in the project list."/>

        <Grid Grid.Row="1" ColumnSpacing="10">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*"/>
                <ColumnDefinition Width="Auto"/>
            </Grid.ColumnDefinitions>
            <ListView x:Name="RootsList" Grid.Column="0" SelectionMode="Single"
                      AutomationProperties.AutomationId="RootsList"
                      BorderThickness="1"
                      BorderBrush="{ThemeResource ControlStrokeColorDefaultBrush}"
                      CornerRadius="{ThemeResource ControlCornerRadius}"/>
            <StackPanel Grid.Column="1" Spacing="8">
                <Button x:Name="AddButton" Content="Add…" MinWidth="92" Click="AddButton_Click"
                        AutomationProperties.AutomationId="AddRootButton"
                        ToolTipService.ToolTip="Pick a folder that contains your projects — each subfolder becomes a project entry"/>
                <Button x:Name="RemoveButton" Content="Remove" MinWidth="92" Click="RemoveButton_Click"
                        AutomationProperties.AutomationId="RemoveRootButton"
                        ToolTipService.ToolTip="Stop scanning the selected root. Your folders and files are NOT deleted."/>
            </StackPanel>
        </Grid>

        <StackPanel Grid.Row="2" Spacing="6">
            <TextBlock Text="Default root for new projects"
                       ToolTipService.ToolTip="Preselected in the New Project dialog when 'All' is active in the sidebar"/>
            <ComboBox x:Name="DefaultCombo" HorizontalAlignment="Stretch"
                      AutomationProperties.AutomationId="DefaultRootCombo"
                      SelectionChanged="DefaultCombo_SelectionChanged"/>
        </StackPanel>
    </Grid>
</ContentDialog>
```

- [ ] **Step 2: SettingsDialog.xaml.cs**

Uses the WinAppSDK 1.8+ picker (`Microsoft.Windows.Storage.Pickers`) — works packaged and unpackaged, no `InitializeWithWindow`. Fallback if the project's WinAppSDK is <1.8: use `Windows.Storage.Pickers.FolderPicker` + `WinRT.Interop.InitializeWithWindow` instead (and note the packaged-app caveat).

```csharp
using DevProjects.App.ViewModels;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Windows.Storage.Pickers;

namespace DevProjects.App.Views;

public sealed partial class SettingsDialog : ContentDialog
{
    private readonly MainViewModel _viewModel;
    private readonly WindowId _windowId;
    private bool _loading;

    public SettingsDialog(MainViewModel viewModel, WindowId windowId)
    {
        InitializeComponent();
        _viewModel = viewModel;
        _windowId = windowId;
        RefreshLists();
    }

    private void RefreshLists()
    {
        _loading = true;
        var roots = (_viewModel.Config.Roots ?? []).ToList();
        RootsList.ItemsSource = roots;
        DefaultCombo.ItemsSource = roots;
        DefaultCombo.SelectedItem = roots.FirstOrDefault(r =>
            string.Equals(r, _viewModel.Config.DefaultRoot, StringComparison.OrdinalIgnoreCase));
        _loading = false;
    }

    private async void AddButton_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker(_windowId)
        {
            SuggestedStartLocation = PickerLocationId.DocumentsLibrary,
        };
        var result = await picker.PickSingleFolderAsync();
        if (result is not null)
        {
            _viewModel.AddRoot(result.Path);
            RefreshLists();
        }
    }

    private void RemoveButton_Click(object sender, RoutedEventArgs e)
    {
        if (RootsList.SelectedItem is not string root) return;
        _viewModel.RemoveRoot(root);
        RefreshLists();
    }

    private void DefaultCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (DefaultCombo.SelectedItem is string root)
            _viewModel.SetDefaultRoot(root);
    }
}
```

- [ ] **Step 3: Build** — `dotnet build "src/DevProjects.WinUI" -p:Platform=x64` → PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/DevProjects.WinUI/Views; git commit -m "feat: port Settings dialog with WinAppSDK folder picker"
```

---

### Task 7: HelpWindow

**Files:**
- Create: `src/DevProjects.WinUI/Views/HelpWindow.xaml` + `.xaml.cs`

- [ ] **Step 1: HelpWindow.xaml** — port the WPF `src/DevProjects.App/Views/HelpWindow.xaml` content verbatim with these mechanical substitutions (the text content — every `<TextBlock>` run, the shortcuts grid, the flag list — is copied 1:1 from the WPF file):
  - Root element: `<Window x:Class="DevProjects.App.Views.HelpWindow" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:core="using:DevProjects.Core.Services" Title="Dev-Projects — Help">` (drop `Height/Width/WindowStartupLocation/ShowInTaskbar` attributes — sized in code).
  - `DockPanel` → `Grid` with two rows (`*` for the ScrollViewer, `Auto` for the close-button border at the bottom).
  - Close `Button` gets `Click="Close_Click"` (no `IsDefault`/`IsCancel` in WinUI).
  - `FontSize="20" FontWeight="SemiBold"` heading → `Style="{StaticResource SubtitleTextBlockStyle}"`; the `FontSize="15" FontWeight="SemiBold"` section headers → `Style="{StaticResource BodyStrongTextBlockStyle}"`.
  - `FontFamily="Consolas"` → `FontFamily="Cascadia Mono"`.
  - The flag `ItemsControl` keeps `x:Name="FlagList"`; its `DataTemplate` gains `x:DataType="core:FlagPreset"` and `{Binding ...}` becomes `{x:Bind ...}`.

- [ ] **Step 2: HelpWindow.xaml.cs**

```csharp
using DevProjects.Core.Services;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using System.Runtime.InteropServices;
using Windows.Graphics;

namespace DevProjects.App.Views;

public sealed partial class HelpWindow : Window
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    public HelpWindow()
    {
        InitializeComponent();
        Title = "Dev-Projects — Help";
        FlagList.ItemsSource = ClaudeFlagCatalog.Presets;

        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var scale = GetDpiForWindow(hwnd) / 96.0;
        var width = (int)(680 * scale);
        var height = (int)(640 * scale);
        AppWindow.Resize(new SizeInt32(width, height));
        var area = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        AppWindow.Move(new PointInt32(
            area.X + (area.Width - width) / 2,
            area.Y + (area.Height - height) / 2));
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
```

- [ ] **Step 3: Build** — `dotnet build "src/DevProjects.WinUI" -p:Platform=x64` → PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/DevProjects.WinUI/Views; git commit -m "feat: port Help window"
```

---

### Task 8: MainWindow — XAML and code-behind (first runnable milestone)

**Files:**
- Replace: `src/DevProjects.WinUI/MainWindow.xaml`
- Replace: `src/DevProjects.WinUI/MainWindow.xaml.cs`

Design notes applied (winui-design): InfoBars replace hardcoded banner colors; `PlaceholderText` replaces the watermark hack; FontIcons replace emoji; all colors are `{ThemeResource}`; Mica backdrop; root Grid has `Background="Transparent"` so drop hit-testing works; bool→Visibility uses x:Bind implicit conversion (no converter); `SelectedItem` bindings use `{Binding}` (typed `x:Bind` TwoWay on `object SelectedItem` doesn't compile) so `RootGrid.DataContext = ViewModel` is also set.

- [ ] **Step 1: Write MainWindow.xaml** (complete file):

```xml
<Window x:Class="DevProjects.App.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:vm="using:DevProjects.App.ViewModels"
        xmlns:local="using:DevProjects.App"
        Title="Dev-Projects">

    <Grid x:Name="RootGrid" AllowDrop="True" Background="Transparent"
          DragOver="Root_DragOver" DragLeave="Root_DragLeave" Drop="Root_Drop">
        <Grid.KeyboardAccelerators>
            <KeyboardAccelerator Key="F" Modifiers="Control" Invoked="FocusSearch_Invoked"/>
            <KeyboardAccelerator Key="N" Modifiers="Control" Invoked="NewProject_Invoked"/>
            <KeyboardAccelerator Key="F5" Invoked="Refresh_Invoked"/>
            <KeyboardAccelerator Key="F1" Invoked="Help_Invoked"/>
            <KeyboardAccelerator Key="Escape" Invoked="ClearSearch_Invoked"/>
        </Grid.KeyboardAccelerators>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <!-- Warning banner: claude not on PATH -->
        <InfoBar Grid.Row="0" Severity="Warning" IsClosable="False" Margin="12,8,12,0"
                 IsOpen="{x:Bind ViewModel.ClaudeMissing, Mode=OneWay}"
                 Message="'claude' was not found on PATH. Sessions will open a terminal, but the claude command will fail. Install Claude Code or fix PATH, then press Refresh (F5)."/>

        <!-- First-run onboarding -->
        <InfoBar Grid.Row="1" Severity="Informational" Margin="12,8,12,0"
                 IsOpen="{x:Bind ViewModel.ShowOnboarding, Mode=OneWay}"
                 CloseButtonClick="OnboardingClose_Click"
                 Title="Welcome to Dev-Projects!"
                 Message="Pick a project and press Enter to continue its last Claude session, or Ctrl+Enter for a fresh one. Filter by folder on the left, search with Ctrl+F, pin favourites with the star, and press F1 anytime for the full guide.">
            <InfoBar.ActionButton>
                <Button Content="Open guide" Click="HelpButton_Click"
                        ToolTipService.ToolTip="Open the full help guide (F1)"/>
            </InfoBar.ActionButton>
        </InfoBar>

        <!-- Main area -->
        <Grid Grid.Row="2" Margin="0,4,0,0">
            <Grid.ColumnDefinitions>
                <ColumnDefinition Width="240"/>
                <ColumnDefinition Width="*"/>
            </Grid.ColumnDefinitions>

            <!-- Sidebar -->
            <Grid Grid.Column="0" Margin="12,0,0,12">
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="*"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>
                <TextBlock Grid.Row="0" Text="SOURCE ROOTS" Margin="8,4,0,8"
                           Style="{StaticResource CaptionTextBlockStyle}" Opacity="0.6"
                           ToolTipService.ToolTip="Folders that are scanned for projects. Click one to filter the list."/>
                <ListView x:Name="SidebarList" Grid.Row="1"
                          AutomationProperties.AutomationId="SidebarList"
                          ItemsSource="{x:Bind ViewModel.SidebarItems}"
                          SelectedItem="{Binding SelectedSidebarItem, Mode=TwoWay}"
                          SelectionMode="Single"
                          ContainerContentChanging="SidebarList_ContainerContentChanging">
                    <ListView.ItemTemplate>
                        <DataTemplate x:DataType="vm:SidebarItemViewModel">
                            <TextBlock Text="{x:Bind DisplayName}"/>
                        </DataTemplate>
                    </ListView.ItemTemplate>
                </ListView>
                <StackPanel Grid.Row="2" Spacing="8">
                    <Border Height="1" Margin="0,4"
                            Background="{ThemeResource DividerStrokeColorDefaultBrush}"/>
                    <Grid ToolTipService.ToolTip="Choose the app colour theme. 'System' follows your Windows light/dark setting.">
                        <Grid.ColumnDefinitions>
                            <ColumnDefinition Width="Auto"/>
                            <ColumnDefinition Width="*"/>
                        </Grid.ColumnDefinitions>
                        <TextBlock Grid.Column="0" Text="Theme" VerticalAlignment="Center"
                                   Margin="4,0,8,0" Opacity="0.8"/>
                        <ComboBox Grid.Column="1" HorizontalAlignment="Stretch"
                                  AutomationProperties.AutomationId="ThemeCombo"
                                  ItemsSource="{x:Bind ViewModel.Themes}"
                                  SelectedItem="{Binding Theme, Mode=TwoWay}"/>
                    </Grid>
                    <Button HorizontalAlignment="Stretch" Click="SettingsButton_Click"
                            AutomationProperties.AutomationId="SettingsButton"
                            ToolTipService.ToolTip="Manage source roots and the default folder for new projects">
                        <StackPanel Orientation="Horizontal" Spacing="8">
                            <FontIcon Glyph="&#xE713;" FontSize="14"/>
                            <TextBlock Text="Settings"/>
                        </StackPanel>
                    </Button>
                    <Button HorizontalAlignment="Stretch" Click="HelpButton_Click"
                            AutomationProperties.AutomationId="HelpButton"
                            ToolTipService.ToolTip="How everything works, including keyboard shortcuts (F1)">
                        <StackPanel Orientation="Horizontal" Spacing="8">
                            <FontIcon Glyph="&#xE897;" FontSize="14"/>
                            <TextBlock Text="Help"/>
                        </StackPanel>
                    </Button>
                </StackPanel>
            </Grid>

            <!-- Content -->
            <Grid Grid.Column="1" Margin="12,0,12,12">
                <Grid.RowDefinitions>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="Auto"/>
                    <RowDefinition Height="*"/>
                    <RowDefinition Height="Auto"/>
                </Grid.RowDefinitions>

                <!-- Search + sort -->
                <Grid Grid.Row="0" Margin="0,0,0,8" ColumnSpacing="8">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <TextBox x:Name="SearchBox" Grid.Column="0"
                             AutomationProperties.AutomationId="SearchBox"
                             PlaceholderText="Search projects   (Ctrl+F)"
                             Text="{x:Bind ViewModel.SearchText, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}"
                             ToolTipService.ToolTip="Type to filter projects by name. Ctrl+F focuses this box; Esc clears it."/>
                    <ComboBox x:Name="SortCombo" Grid.Column="1" MinWidth="170"
                              AutomationProperties.AutomationId="SortCombo"
                              SelectionChanged="SortCombo_SelectionChanged"
                              ToolTipService.ToolTip="Change how the project list is ordered. Pinned projects always stay on top.">
                        <ComboBoxItem Content="Sort: Recently used" Tag="LastUsed"/>
                        <ComboBoxItem Content="Sort: Name A–Z" Tag="Name"/>
                    </ComboBox>
                </Grid>

                <!-- Flags row -->
                <Grid Grid.Row="1" Margin="0,0,0,8" ColumnSpacing="8"
                      ToolTipService.ToolTip="Extra command-line flags passed to claude when launching the selected project. Select a project first, then add flags (e.g. --model opus). Saved automatically as you type; used by both New and Continue.">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="Auto"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>
                    <TextBlock Grid.Column="0" Text="Flags:" VerticalAlignment="Center"/>
                    <TextBox Grid.Column="1"
                             AutomationProperties.AutomationId="FlagsBox"
                             Text="{x:Bind ViewModel.FlagsText, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}"
                             IsEnabled="{x:Bind ViewModel.FlagsEnabled, Mode=OneWay}"/>
                    <DropDownButton Grid.Column="2"
                                    AutomationProperties.AutomationId="AddFlagButton"
                                    IsEnabled="{x:Bind ViewModel.FlagsEnabled, Mode=OneWay}"
                                    ToolTipService.ToolTip="Insert a common claude flag with an explanation of what it does">
                        <StackPanel Orientation="Horizontal" Spacing="6">
                            <FontIcon Glyph="&#xE710;" FontSize="12"/>
                            <TextBlock Text="Flag"/>
                        </StackPanel>
                        <DropDownButton.Flyout>
                            <MenuFlyout x:Name="FlagMenu" Placement="Bottom"/>
                        </DropDownButton.Flyout>
                    </DropDownButton>
                </Grid>

                <!-- Project list + empty state -->
                <Grid Grid.Row="2">
                    <ListView x:Name="ProjectList"
                              AutomationProperties.AutomationId="ProjectList"
                              ItemsSource="{x:Bind ViewModel.Projects}"
                              SelectedItem="{Binding SelectedProject, Mode=TwoWay}"
                              SelectionMode="Single"
                              KeyDown="ProjectList_KeyDown">
                        <ListView.ItemContainerStyle>
                            <Style TargetType="ListViewItem" BasedOn="{StaticResource DefaultListViewItemStyle}">
                                <Setter Property="HorizontalContentAlignment" Value="Stretch"/>
                                <Setter Property="Padding" Value="8,6"/>
                            </Style>
                        </ListView.ItemContainerStyle>
                        <ListView.ItemTemplate>
                            <DataTemplate x:DataType="vm:ProjectItemViewModel">
                                <Grid Background="Transparent" ColumnSpacing="6">
                                    <Grid.ContextFlyout>
                                        <MenuFlyout Opening="RowFlyout_Opening">
                                            <MenuFlyoutItem Text="Open in Explorer" Click="OpenInExplorer_Click"/>
                                            <MenuFlyoutItem Text="Open in VS Code" Click="OpenInVsCode_Click"/>
                                            <MenuFlyoutItem Text="Copy path" Click="CopyPath_Click"/>
                                            <MenuFlyoutSeparator/>
                                            <MenuFlyoutItem Text="Rename…" Click="Rename_Click"
                                                            ToolTipService.ToolTip="Rename the project folder (config and pin follow the new name)"/>
                                            <MenuFlyoutSubItem Text="Move to root"
                                                               ToolTipService.ToolTip="Move the project folder to another source root, e.g. Archive or Stable"/>
                                            <MenuFlyoutSeparator/>
                                            <MenuFlyoutItem Text="Pin / Unpin" Click="Pin_Click"/>
                                        </MenuFlyout>
                                    </Grid.ContextFlyout>
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="Auto"/>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="Auto"/>
                                    </Grid.ColumnDefinitions>

                                    <!-- Pin -->
                                    <Button Grid.Column="0" Width="32" Height="32" Padding="0"
                                            Background="Transparent" BorderThickness="0"
                                            AutomationProperties.Name="{x:Bind PinToolTip, Mode=OneWay}"
                                            Click="Pin_Click"
                                            ToolTipService.ToolTip="{x:Bind PinToolTip, Mode=OneWay}">
                                        <FontIcon Glyph="{x:Bind PinGlyph, Mode=OneWay}" FontSize="14"
                                                  Opacity="{x:Bind PinOpacity, Mode=OneWay}"
                                                  Foreground="{x:Bind local:MainWindow.PinBrush(IsPinned), Mode=OneWay}"/>
                                    </Button>

                                    <!-- Name + metadata -->
                                    <StackPanel Grid.Column="1" Orientation="Horizontal" Spacing="10"
                                                VerticalAlignment="Center">
                                        <TextBlock Text="{x:Bind Name}" Style="{StaticResource BodyStrongTextBlockStyle}"
                                                   VerticalAlignment="Center"
                                                   ToolTipService.ToolTip="{x:Bind Path}"/>
                                        <Border CornerRadius="9" Padding="8,2" VerticalAlignment="Center"
                                                Background="{ThemeResource AccentFillColorDefaultBrush}"
                                                ToolTipService.ToolTip="{x:Bind Root}">
                                            <TextBlock Text="{x:Bind RootName}" FontSize="10"
                                                       Foreground="{ThemeResource TextOnAccentFillColorPrimaryBrush}"/>
                                        </Border>
                                        <Border CornerRadius="9" Padding="7,2" VerticalAlignment="Center"
                                                Background="{ThemeResource SystemFillColorSuccessBrush}"
                                                Visibility="{x:Bind IsRunning, Mode=OneWay}"
                                                ToolTipService.ToolTip="{x:Bind RunningToolTip}">
                                            <TextBlock Text="● live" FontSize="10"
                                                       Foreground="{ThemeResource TextOnAccentFillColorPrimaryBrush}"/>
                                        </Border>
                                        <StackPanel Orientation="Horizontal" Spacing="3" VerticalAlignment="Center"
                                                    Visibility="{x:Bind HasGitInfo, Mode=OneWay}"
                                                    ToolTipService.ToolTip="{x:Bind GitToolTip, Mode=OneWay}">
                                            <TextBlock Text="⎇" FontSize="11" Opacity="0.7"/>
                                            <TextBlock Text="{x:Bind GitBranch, Mode=OneWay}" FontSize="11" Opacity="0.7"/>
                                            <TextBlock Text="●" FontSize="10"
                                                       Foreground="{ThemeResource SystemFillColorCautionBrush}"
                                                       Visibility="{x:Bind local:MainWindow.TrueWhen(GitDirty), Mode=OneWay}"/>
                                        </StackPanel>
                                        <TextBlock Text="{x:Bind LastUsedText}" Opacity="0.55"
                                                   Style="{StaticResource CaptionTextBlockStyle}"
                                                   VerticalAlignment="Center"
                                                   ToolTipService.ToolTip="When you last launched a Claude session here from this app"/>
                                    </StackPanel>

                                    <!-- Launch buttons -->
                                    <StackPanel Grid.Column="2" Orientation="Horizontal" Spacing="6"
                                                VerticalAlignment="Center">
                                        <Button Content="New" Padding="14,4" Click="LaunchNew_Click"
                                                AutomationProperties.Name="New session"
                                                ToolTipService.ToolTip="Start a fresh Claude session in this project (Ctrl+Enter)"/>
                                        <Button Content="Continue" Padding="14,4" Click="LaunchContinue_Click"
                                                AutomationProperties.Name="Continue session"
                                                IsEnabled="{x:Bind HasSession, Mode=OneWay}"
                                                ToolTipService.ToolTip="{x:Bind ContinueToolTip, Mode=OneWay}"/>
                                    </StackPanel>
                                </Grid>
                            </DataTemplate>
                        </ListView.ItemTemplate>
                    </ListView>

                    <!-- Empty state -->
                    <TextBlock Text="{x:Bind ViewModel.EmptyStateText, Mode=OneWay}"
                               TextWrapping="Wrap" TextAlignment="Center" MaxWidth="420"
                               HorizontalAlignment="Center" VerticalAlignment="Center"
                               Opacity="0.6"
                               Visibility="{x:Bind ViewModel.IsListEmpty, Mode=OneWay}"/>
                </Grid>

                <!-- Bottom action bar -->
                <StackPanel Grid.Row="3" Orientation="Horizontal" Spacing="8" Margin="0,8,0,0">
                    <Button Click="NewProjectButton_Click"
                            AutomationProperties.AutomationId="NewProjectButton"
                            ToolTipService.ToolTip="Create a new empty project folder and (optionally) start Claude in it (Ctrl+N)">
                        <StackPanel Orientation="Horizontal" Spacing="6">
                            <FontIcon Glyph="&#xE710;" FontSize="12"/>
                            <TextBlock Text="New Project"/>
                        </StackPanel>
                    </Button>
                    <Button Command="{x:Bind ViewModel.RescanCommand}"
                            AutomationProperties.AutomationId="RefreshButton"
                            ToolTipService.ToolTip="Rescan the source roots now (F5). The list also refreshes automatically when folders change.">
                        <StackPanel Orientation="Horizontal" Spacing="6">
                            <FontIcon Glyph="&#xE72C;" FontSize="12"/>
                            <TextBlock Text="Refresh"/>
                        </StackPanel>
                    </Button>
                </StackPanel>
            </Grid>
        </Grid>

        <!-- Status bar -->
        <Border Grid.Row="3" Padding="12,6" BorderThickness="0,1,0,0"
                BorderBrush="{ThemeResource DividerStrokeColorDefaultBrush}">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto"/>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Grid.Column="0" Text="{x:Bind ViewModel.ClaudeVersionText, Mode=OneWay}"
                           Opacity="0.7" Style="{StaticResource CaptionTextBlockStyle}"
                           ToolTipService.ToolTip="Version of the claude CLI found on PATH"/>
                <StackPanel Grid.Column="1" Orientation="Horizontal" Spacing="6"
                            HorizontalAlignment="Center">
                    <TextBlock Text="{x:Bind ViewModel.StatusText, Mode=OneWay}" Opacity="0.7"
                               Style="{StaticResource CaptionTextBlockStyle}"/>
                    <TextBlock Text="{x:Bind ViewModel.RunningSummary, Mode=OneWay}"
                               Style="{StaticResource CaptionTextBlockStyle}"
                               Foreground="{ThemeResource SystemFillColorSuccessBrush}"
                               ToolTipService.ToolTip="Projects with a claude process running in their folder right now (rechecked every 30 seconds)"/>
                </StackPanel>
                <TextBlock Grid.Column="2" Opacity="0.7" Style="{StaticResource CaptionTextBlockStyle}"
                           Text="Enter = Continue · Ctrl+Enter = New · Ctrl+F = Search · F1 = Help"/>
            </Grid>
        </Border>

        <!-- Drag-drop overlay -->
        <Border x:Name="DropOverlay" Grid.RowSpan="4" Visibility="Collapsed" IsHitTestVisible="False"
                Background="{ThemeResource SmokeFillColorDefaultBrush}">
            <Border BorderBrush="{ThemeResource AccentFillColorDefaultBrush}" BorderThickness="2"
                    CornerRadius="{ThemeResource OverlayCornerRadius}" Margin="40"
                    Background="{ThemeResource AcrylicBackgroundFillColorDefaultBrush}">
                <TextBlock Text="Drop a folder here&#10;Add it as a source root, or launch Claude in it"
                           Style="{StaticResource SubtitleTextBlockStyle}" TextAlignment="Center"
                           HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
        </Border>

        <!-- Toast -->
        <Border x:Name="Toast" Grid.RowSpan="4" HorizontalAlignment="Center" VerticalAlignment="Bottom"
                Margin="0,0,0,48" Padding="16,8" CornerRadius="{ThemeResource OverlayCornerRadius}"
                Background="{ThemeResource AcrylicBackgroundFillColorDefaultBrush}"
                BorderBrush="{ThemeResource SurfaceStrokeColorFlyoutBrush}" BorderThickness="1"
                Visibility="Collapsed" IsHitTestVisible="False">
            <TextBlock x:Name="ToastText" Style="{StaticResource CaptionTextBlockStyle}"/>
        </Border>
    </Grid>
</Window>
```

- [ ] **Step 2: Write MainWindow.xaml.cs** (complete file):

```csharp
using System.IO;
using System.Runtime.InteropServices;
using DevProjects.App.Services;
using DevProjects.App.ViewModels;
using DevProjects.App.Views;
using Microsoft.UI;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.ApplicationModel.DataTransfer;
using Windows.Graphics;
using Windows.Storage;
using Windows.System;
using Windows.UI.Core;

namespace DevProjects.App;

public sealed partial class MainWindow : Window
{
    public MainViewModel ViewModel { get; }

    private readonly ContentDialogUserDialogs _dialogs;
    private readonly DispatcherQueueTimer _toastTimer;
    private HelpWindow? _helpWindow;

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    public MainWindow()
    {
        _dialogs = new ContentDialogUserDialogs(() => Content.XamlRoot);
        ViewModel = new MainViewModel(DispatcherQueue, _dialogs);
        InitializeComponent();

        Title = "Dev-Projects";
        SystemBackdrop = new MicaBackdrop();
        RootGrid.DataContext = ViewModel;

        ViewModel.ToastRequested += ShowToast;
        ViewModel.ThemeChangeRequested += ApplyTheme;
        ApplyTheme(ViewModel.Theme);

        _toastTimer = DispatcherQueue.CreateTimer();
        _toastTimer.Interval = TimeSpan.FromSeconds(2.6);
        _toastTimer.IsRepeating = false;
        _toastTimer.Tick += (_, _) => Toast.Visibility = Visibility.Collapsed;

        BuildFlagMenu();
        SyncSortCombo();
        ConfigureAppWindow();

        Closed += (_, _) => ViewModel.Shutdown();
    }

    // ---------- Window chrome / sizing ----------

    private void ConfigureAppWindow()
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var scale = GetDpiForWindow(hwnd) / 96.0;
        var width = (int)(1000 * scale);
        var height = (int)(680 * scale);
        AppWindow.Resize(new SizeInt32(width, height));

        var area = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        AppWindow.Move(new PointInt32(
            area.X + (area.Width - width) / 2,
            area.Y + (area.Height - height) / 2));

        var icon = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (File.Exists(icon)) AppWindow.SetIcon(icon);

        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            // PreferredMinimum* requires WinAppSDK 1.7+; drop these two lines if the SDK is older.
            presenter.PreferredMinimumWidth = (int)(760 * scale);
            presenter.PreferredMinimumHeight = (int)(480 * scale);
        }
    }

    private void ApplyTheme(string theme)
    {
        RootGrid.RequestedTheme = theme switch
        {
            "Light" => ElementTheme.Light,
            "Dark" => ElementTheme.Dark,
            _ => ElementTheme.Default,
        };
    }

    // ---------- x:Bind helpers ----------

    /// <summary>Caution (amber) brush for the pinned star; null falls back to the inherited foreground.</summary>
    public static Brush? PinBrush(bool isPinned) => isPinned
        ? (Brush)Application.Current.Resources["SystemFillColorCautionBrush"]
        : null;

    public static Visibility TrueWhen(bool? value) =>
        value == true ? Visibility.Visible : Visibility.Collapsed;

    // ---------- Toast ----------

    private void ShowToast(string message)
    {
        ToastText.Text = message;
        Toast.Visibility = Visibility.Visible;
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    // ---------- Onboarding ----------

    private void OnboardingClose_Click(InfoBar sender, object args) =>
        ViewModel.DismissOnboardingCommand.Execute(null);

    // ---------- Keyboard accelerators ----------

    private void FocusSearch_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (DialogGate.AnyOpen) return;
        SearchBox.Focus(FocusState.Programmatic);
        SearchBox.SelectAll();
        args.Handled = true;
    }

    private void NewProject_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (DialogGate.AnyOpen) return;
        args.Handled = true;
        _ = ShowNewProjectDialogAsync();
    }

    private void Refresh_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (DialogGate.AnyOpen) return;
        ViewModel.RescanCommand.Execute(null);
        args.Handled = true;
    }

    private void Help_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (DialogGate.AnyOpen) return;
        ShowHelp();
        args.Handled = true;
    }

    private void ClearSearch_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (DialogGate.AnyOpen || string.IsNullOrEmpty(ViewModel.SearchText)) return;
        ViewModel.SearchText = "";
        args.Handled = true;
    }

    // ---------- Sidebar: per-item enable + tooltip (Style setters can't bind in WinUI) ----------

    private void SidebarList_ContainerContentChanging(ListViewBase sender, ContainerContentChangingEventArgs args)
    {
        if (args.Item is SidebarItemViewModel item)
        {
            args.ItemContainer.IsEnabled = item.Enabled;
            ToolTipService.SetToolTip(args.ItemContainer, item.ToolTip);
        }
    }

    // ---------- Sort combo ----------

    private void SyncSortCombo()
    {
        foreach (ComboBoxItem item in SortCombo.Items)
        {
            if ((string)item.Tag == ViewModel.SortMode)
            {
                SortCombo.SelectedItem = item;
                return;
            }
        }
        SortCombo.SelectedIndex = 0;
    }

    private void SortCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ViewModel is null) return;
        if (SortCombo.SelectedItem is ComboBoxItem item && item.Tag is string mode)
            ViewModel.SortMode = mode;
    }

    // ---------- Flags menu ----------

    private void BuildFlagMenu()
    {
        foreach (var preset in ViewModel.FlagPresets)
        {
            var item = new MenuFlyoutItem
            {
                Text = preset.Display,
                Command = ViewModel.InsertFlagCommand,
                CommandParameter = preset,
            };
            ToolTipService.SetToolTip(item, preset.Description);
            FlagMenu.Items.Add(item);
        }
    }

    // ---------- Project list interaction ----------

    private static ProjectItemViewModel? ItemOf(object sender) =>
        (sender as FrameworkElement)?.DataContext as ProjectItemViewModel;

    private void LaunchNew_Click(object sender, RoutedEventArgs e) =>
        ViewModel.LaunchNewCommand.Execute(ItemOf(sender));

    private void LaunchContinue_Click(object sender, RoutedEventArgs e) =>
        ViewModel.LaunchContinueCommand.Execute(ItemOf(sender));

    private void Pin_Click(object sender, RoutedEventArgs e) =>
        ViewModel.TogglePinCommand.Execute(ItemOf(sender));

    private void OpenInExplorer_Click(object sender, RoutedEventArgs e) =>
        ViewModel.OpenInExplorerCommand.Execute(ItemOf(sender));

    private void OpenInVsCode_Click(object sender, RoutedEventArgs e) =>
        ViewModel.OpenInVsCodeCommand.Execute(ItemOf(sender));

    private void CopyPath_Click(object sender, RoutedEventArgs e) =>
        ViewModel.CopyPathCommand.Execute(ItemOf(sender));

    private void Rename_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is not { } project) return;
        _ = ShowRenameDialogAsync(project);
    }

    private async Task ShowRenameDialogAsync(ProjectItemViewModel project)
    {
        var dialog = new RenameProjectDialog(ViewModel, project)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        await DialogGate.ShowAsync(dialog);
    }

    /// <summary>Right-click/context: select the row, sync VS Code visibility, rebuild the Move-to-root submenu.</summary>
    private void RowFlyout_Opening(object sender, object e)
    {
        if (sender is not MenuFlyout flyout) return;
        var project = (flyout.Target as FrameworkElement)?.DataContext as ProjectItemViewModel;
        if (project is null) return;

        ProjectList.SelectedItem = project; // context actions target the row under the cursor

        foreach (var entry in flyout.Items)
        {
            if (entry is MenuFlyoutItem { Text: "Open in VS Code" } vsCode)
                vsCode.Visibility = ViewModel.VsCodeAvailable ? Visibility.Visible : Visibility.Collapsed;

            if (entry is MenuFlyoutSubItem { Text: "Move to root" } move)
            {
                move.Items.Clear();
                var targets = ViewModel.MoveTargetRoots;
                if (targets.Count == 0)
                {
                    move.Items.Add(new MenuFlyoutItem { Text = "(no roots available)", IsEnabled = false });
                    continue;
                }
                foreach (var root in targets)
                {
                    var item = new MenuFlyoutItem
                    {
                        Text = root,
                        IsEnabled = !string.Equals(root, project.Root, StringComparison.OrdinalIgnoreCase),
                        Command = ViewModel.MoveSelectedToRootCommand,
                        CommandParameter = root,
                    };
                    ToolTipService.SetToolTip(item, $"Move the project folder into {root}");
                    move.Items.Add(item);
                }
            }
        }
    }

    /// <summary>Enter = Continue (falls back to New when no session), Ctrl+Enter = New.</summary>
    private void ProjectList_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key != VirtualKey.Enter || ViewModel.SelectedProject is null) return;
        var ctrl = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control)
            .HasFlag(CoreVirtualKeyStates.Down);
        if (ctrl)
            ViewModel.LaunchNewCommand.Execute(ViewModel.SelectedProject);
        else if (ViewModel.SelectedProject.HasSession)
            ViewModel.LaunchContinueCommand.Execute(ViewModel.SelectedProject);
        else
            ViewModel.LaunchNewCommand.Execute(ViewModel.SelectedProject);
        e.Handled = true;
    }

    // ---------- Dialog launchers ----------

    private void NewProjectButton_Click(object sender, RoutedEventArgs e) => _ = ShowNewProjectDialogAsync();

    private async Task ShowNewProjectDialogAsync()
    {
        var dialog = new NewProjectDialog(ViewModel)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        await DialogGate.ShowAsync(dialog);
    }

    private void SettingsButton_Click(object sender, RoutedEventArgs e) => _ = ShowSettingsDialogAsync();

    private async Task ShowSettingsDialogAsync()
    {
        var dialog = new SettingsDialog(ViewModel, AppWindow.Id)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        await DialogGate.ShowAsync(dialog);
        ViewModel.RescanCommand.Execute(null);
    }

    private void HelpButton_Click(object sender, RoutedEventArgs e) => ShowHelp();

    private void ShowHelp()
    {
        if (_helpWindow is not null)
        {
            _helpWindow.Activate();
            return;
        }
        _helpWindow = new HelpWindow();
        _helpWindow.Closed += (_, _) => _helpWindow = null;
        _helpWindow.Activate();
    }

    // ---------- Drag & drop ----------

    private void Root_DragOver(object sender, DragEventArgs e)
    {
        var hasItems = e.DataView.Contains(StandardDataFormats.StorageItems);
        e.AcceptedOperation = hasItems ? DataPackageOperation.Link : DataPackageOperation.None;
        DropOverlay.Visibility = hasItems ? Visibility.Visible : Visibility.Collapsed;
        e.Handled = true;
    }

    private void Root_DragLeave(object sender, DragEventArgs e)
    {
        DropOverlay.Visibility = Visibility.Collapsed;
    }

    private async void Root_Drop(object sender, DragEventArgs e)
    {
        DropOverlay.Visibility = Visibility.Collapsed;
        if (!e.DataView.Contains(StandardDataFormats.StorageItems)) return;
        var items = await e.DataView.GetStorageItemsAsync();
        var folder = items.OfType<StorageFolder>().FirstOrDefault();
        if (folder is null || !Directory.Exists(folder.Path)) return;
        var path = folder.Path;

        if (ViewModel.IsKnownRootChild(path))
        {
            // Already a scannable project — just select it.
            ViewModel.RescanCommand.Execute(null);
            ViewModel.SelectProjectByPath(path);
            return;
        }

        var dialog = new ContentDialog
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
            Title = "Dropped Folder",
            Content = new TextBlock { Text = $"{path}\n\nWhat would you like to do with this folder?", TextWrapping = TextWrapping.Wrap },
            PrimaryButtonText = "Add as a source root",
            SecondaryButtonText = "Launch Claude here (one-off)",
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
        };
        var result = await DialogGate.ShowAsync(dialog);
        switch (result)
        {
            case ContentDialogResult.Primary:
                ViewModel.AddRoot(path);
                break;
            case ContentDialogResult.Secondary:
                await ViewModel.LaunchInFolderAsync(path);
                break;
        }
    }
}
```

- [ ] **Step 3: Build and run the full smoke test**

```powershell
dotnet build "src/DevProjects.WinUI" -p:Platform=x64
winapp run --project "src/DevProjects.WinUI"
```

Expected: window opens ~1000×680, centered, Mica backdrop, project list populated. Verify: search filters live + Esc clears; sort switches; sidebar filters (missing roots greyed with tooltip); flags box enables on selection, ＋Flag menu inserts; pin toggles star; right-click menu — all 7 actions including Rename dialog and Move-to-root confirm; Enter/Ctrl+Enter launch; Ctrl+N New Project dialog (validation inline, Create works, launch checkbox); Settings (Add/Remove/default root, folder picker appears); F1 Help window (second F1 re-activates); theme combo Light/Dark/System live-switches including open dialogs; drag-drop folder (known child selects, unknown shows 3-choice dialog); toast appears after a launch.

- [ ] **Step 4: Commit**

```powershell
git add src/DevProjects.WinUI; git commit -m "feat: port MainWindow to WinUI 3 with Mica, InfoBars, flyouts"
```

---

### Task 9: App startup — single instance + activation pipe

**Files:**
- Modify: `src/DevProjects.WinUI/App.xaml.cs` (MERGE into the template file — keep `InitializeComponent` and any template bootstrap; replace only `OnLaunched` and add the members below)

- [ ] **Step 1: Merge this into App.xaml.cs**

```csharp
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace DevProjects.App;

public partial class App : Application
{
    // Same mutex name as the original PowerShell launcher so the two
    // implementations can never run (and write config.json) concurrently.
    private const string MutexName = "DevProjectsLauncher";
    private const string PipeName = "DevProjects.Activate";

    private Mutex? _mutex;
    private CancellationTokenSource? _pipeServerCts;
    private MainWindow? _window;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _mutex = new Mutex(initiallyOwned: true, MutexName, out var createdNew);
        if (!createdNew)
        {
            // Another instance owns the mutex: ask it to come to the front, then exit.
            TryActivateExistingInstance();
            Exit();
            return;
        }

        _window = new MainWindow();
        _window.Closed += (_, _) =>
        {
            _pipeServerCts?.Cancel();
            if (_mutex is not null)
            {
                try { _mutex.ReleaseMutex(); } catch (ApplicationException) { }
                _mutex.Dispose();
                _mutex = null;
            }
        };
        _window.Activate();

        _pipeServerCts = new CancellationTokenSource();
        _ = RunActivationPipeServerAsync(_pipeServerCts.Token);
    }

    private static void TryActivateExistingInstance()
    {
        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(timeout: 1500);
            using var writer = new StreamWriter(client);
            writer.Write("ACTIVATE");
            writer.Flush();
        }
        catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException)
        {
            // The mutex holder might be the old PowerShell launcher (no pipe
            // server). No XAML window exists in this process path, so a Win32
            // message box is the only available UI.
            _ = MessageBoxW(IntPtr.Zero, "Dev-Projects is already running.", "Dev-Projects", 0x40 /* MB_ICONINFORMATION */);
        }
    }

    private async Task RunActivationPipeServerAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await using var server = new NamedPipeServerStream(
                    PipeName, PipeDirection.In, maxNumberOfServerInstances: 1);
                await server.WaitForConnectionAsync(ct).ConfigureAwait(false);
                using var reader = new StreamReader(server);
                var message = await reader.ReadToEndAsync(ct).ConfigureAwait(false);
                if (message == "ACTIVATE")
                {
                    _window?.DispatcherQueue.TryEnqueue(() =>
                    {
                        if (_window is null) return;
                        if (_window.AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized } p)
                            p.Restore();
                        _window.Activate();
                    });
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception)
            {
                // Broken pipe, access denied, pipe-name squatting… the
                // activation server must never die silently; pause briefly
                // so a persistent failure can't become a hot loop.
                try { await Task.Delay(500, ct).ConfigureAwait(false); }
                catch (OperationCanceledException) { return; }
            }
        }
    }
}
```

- [ ] **Step 2: Build + behavioral check**

```powershell
dotnet build "src/DevProjects.WinUI" -p:Platform=x64
winapp run --project "src/DevProjects.WinUI"
```

While the app is running, launch a second copy of the built exe — the first window must come to the front and the second process must exit. Minimize the window and repeat — it must restore.

- [ ] **Step 3: Full validation sweep (post-migration checklist from the skill)**

```powershell
# Must return NOTHING:
Get-ChildItem "src/DevProjects.WinUI" -Recurse -Filter *.cs | Where-Object FullName -notlike '*\obj\*' | Select-String -Pattern "System\.Windows\."
# Must be True:
Test-Path "src/DevProjects.WinUI/Package.appxmanifest"
# Must return NOTHING:
Select-String -Path "src/DevProjects.WinUI/DevProjects.WinUI.csproj" -Pattern "UseWPF"
dotnet test
```

- [ ] **Step 4: Commit**

```powershell
git add src/DevProjects.WinUI; git commit -m "feat: single-instance mutex + activation pipe in WinUI app"
```

---

### Task 10: Cutover — retire the WPF project

**Files:**
- Modify: `DevProjects.sln` (remove DevProjects.App)
- Delete: `src/DevProjects.App/` (git history preserves it)
- Modify: `src/DevProjects.WinUI/DevProjects.WinUI.csproj` (publish support)
- Modify: `launcher.cmd` (no change expected — verify only)
- Modify: `README.md`

- [ ] **Step 1: Re-run the Task 8 Step 3 smoke checklist end-to-end.** Additionally verify: claude-missing InfoBar (temporarily break PATH or skip), onboarding InfoBar + "Got it"/"Open guide" (temporarily move `%APPDATA%\Dev-Projects\state.json`), live badge with a real running claude session, theme persistence across restart. Fix anything broken before proceeding.

- [ ] **Step 2: Remove the WPF project**

```powershell
dotnet sln remove "src/DevProjects.App/DevProjects.App.csproj"
git rm -r "src/DevProjects.App"
```

- [ ] **Step 3: Unpackaged publish support**

The launcher shim (`launcher.cmd`) starts `publish\Dev-Projects.exe` directly, which requires an UNPACKAGED build. The migration skill forbids `WindowsPackageType=None` *during* migration; migration is now complete and verified, so we add it **conditionally — publish only**, keeping the packaged dev loop (`winapp run`) intact. Add to the csproj's first `<PropertyGroup>`:

```xml
<!-- Packaged for the dev loop (winapp run); unpackaged self-contained for the publish/ folder the launcher shim starts. -->
<WindowsPackageType Condition="'$(UnpackagedPublish)' == 'true'">None</WindowsPackageType>
<WindowsAppSDKSelfContained Condition="'$(UnpackagedPublish)' == 'true'">true</WindowsAppSDKSelfContained>
```

Publish command (document in README):

```powershell
dotnet publish "src/DevProjects.WinUI" -c Release -r win-x64 -p:Platform=x64 -p:UnpackagedPublish=true -o publish
```

Verify: `.\publish\Dev-Projects.exe` starts the app directly, and `launcher.cmd` therefore works unchanged.

- [ ] **Step 4: Update README.md** — replace WPF references (project path `src/DevProjects.App` → `src/DevProjects.WinUI`, "WPF" → "WinUI 3 (Windows App SDK)", and the publish command above).

- [ ] **Step 5: Final validation**

```powershell
dotnet build -p:Platform=x64
dotnet test
.\launcher.cmd
```

Expected: solution builds (Core + WinUI + tests), all tests pass, launcher starts the WinUI app.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat!: replace WPF app with WinUI 3 implementation"
```

---

## Post-plan follow-ups (not part of this plan)
- `winui:winui-code-review` pass on the new project.
- `winui:winui-ui-testing` batch script for automated UI regression.
- Optional: extend title bar into content (`ExtendsContentIntoTitleBar`) for a more modern look.
