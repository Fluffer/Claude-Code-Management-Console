using System.IO;
using System.Runtime.InteropServices;
using DevProjects.App.Services;
using DevProjects.App.ViewModels;
using DevProjects.App.Views;
using DevProjects.Core.Models;
using DevProjects.Core.Services;
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
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer _toastTimer;
    private HelpWindow? _helpWindow;
    private GlobalHotkey? _hotkey;

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    public MainWindow()
    {
        _dialogs = new ContentDialogUserDialogs(() => Content.XamlRoot);
        ViewModel = new MainViewModel(DispatcherQueue, _dialogs);
        InitializeComponent();

        Title = "Dev-Projects";
        RootGrid.DataContext = ViewModel;

        ViewModel.ToastRequested += ShowToast;
        ViewModel.AppearanceChangeRequested += () => ApplyAppearance(rebuild: true);
        ApplyAppearance(rebuild: false);

        _toastTimer = DispatcherQueue.CreateTimer();
        _toastTimer.Interval = TimeSpan.FromSeconds(2.6);
        _toastTimer.IsRepeating = false;
        _toastTimer.Tick += (_, _) => Toast.Visibility = Visibility.Collapsed;

        BuildFlagMenu();
        SyncSortCombo();
        ConfigureAppWindow();
        RegisterGlobalHotkey();

        Closed += (_, _) =>
        {
            _hotkey?.Dispose();
            ViewModel.Shutdown();
        };
    }

    // ---------- Global summon hotkey ----------

    /// <summary>
    /// Registers the system-wide Ctrl+Alt+Space summon hotkey. Fail-soft: if the combo
    /// is already owned by another app, <see cref="GlobalHotkey.Register"/> restores the
    /// original WndProc and returns false; we show a one-time non-blocking toast and
    /// continue — no crash, no retry.
    /// </summary>
    private void RegisterGlobalHotkey()
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        _hotkey = new GlobalHotkey();
        _hotkey.Pressed += () => DispatcherQueue.TryEnqueue(async () =>
        {
            // async-void callback: an unhandled exception here would crash the app, so
            // guard it. The summon is a convenience — failing to open must never take
            // the process down.
            try
            {
                // Bring the window to the foreground, then open the existing Ctrl+P palette.
                AppWindow.Show();
                await ShowCommandPaletteAsync();
            }
            catch (Exception)
            {
                // Best-effort summon; swallow so the message-pump callback can't crash.
            }
        });
        if (!_hotkey.Register(hwnd))
            ShowToast("Global hotkey Ctrl+Alt+Space is in use by another app — summon disabled.");
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

    /// <summary>
    /// Applies theme + accent + font from the ViewModel. The theme is either a base
    /// theme (System/Light/Dark → Mica) or a palette name (solid background + dark
    /// base). When <paramref name="rebuild"/> is true the element theme is flipped
    /// and restored so {ThemeResource} consumers re-resolve the new resources.
    /// </summary>
    private void ApplyAppearance(bool rebuild)
    {
        var pal = Theming.Palettes.Resolve(ViewModel.Theme);
        Theming.Appearance.OverrideResources(ViewModel.Accent, ViewModel.Font, pal);

        if (!string.IsNullOrWhiteSpace(ViewModel.Font))
            FontHost.FontFamily = new FontFamily(ViewModel.Font); // inherited path for non-styled text

        if (pal is not null)
        {
            // Solid palette background; Mica would tint it with the desktop wallpaper.
            SystemBackdrop = null;
            RootGrid.Background = new SolidColorBrush(pal.Background);
            RootGrid.RequestedTheme = ElementTheme.Dark; // all palettes are dark-based
        }
        else
        {
            // Background must stay non-null (Transparent) or drop hit-testing dies.
            RootGrid.Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
            SystemBackdrop ??= new MicaBackdrop();
            RootGrid.RequestedTheme = ViewModel.Theme switch
            {
                "Light" => ElementTheme.Light,
                "Dark" => ElementTheme.Dark,
                _ => ElementTheme.Default,
            };
        }

        if (rebuild)
        {
            // Force {ThemeResource} consumers (accent pills, buttons) to re-resolve.
            var t = RootGrid.RequestedTheme;
            RootGrid.RequestedTheme = t == ElementTheme.Dark ? ElementTheme.Light : ElementTheme.Dark;
            RootGrid.RequestedTheme = t;
        }
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

    // ---------- Recent menu ----------

    private void RecentMenu_Opening(object sender, object e)
    {
        if (sender is not MenuFlyout flyout) return;
        flyout.Items.Clear();
        if (ViewModel.RecentProjects.Count == 0)
        {
            flyout.Items.Add(new MenuFlyoutItem { Text = "(no recent launches)", IsEnabled = false });
            return;
        }
        foreach (var row in ViewModel.RecentProjects)
        {
            var item = new MenuFlyoutItem
            {
                Text = $"{row.Name}  —  {row.RootName}",
                Command = ViewModel.LaunchContinueCommand,
                CommandParameter = row,
            };
            flyout.Items.Add(item);
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

    private void OpenClaudeMd_Click(object sender, RoutedEventArgs e) =>
        ViewModel.OpenClaudeMdCommand.Execute(ItemOf(sender));

    private void OpenSettingsJson_Click(object sender, RoutedEventArgs e) =>
        ViewModel.OpenSettingsJsonCommand.Execute(ItemOf(sender));

    private void CopyPath_Click(object sender, RoutedEventArgs e) =>
        ViewModel.CopyPathCommand.Execute(ItemOf(sender));

    private void SetModel_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is not { } project) return;
        var model = (sender as FrameworkElement)?.Tag as string; // null for "Default"
        ViewModel.SetRowModel(project, model);
    }

    private void ApplyProfile_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem item &&
            item.DataContext is ProjectItemViewModel project &&
            item.Tag is LaunchProfile profile)
            ViewModel.ApplyProfile(project, profile);
    }

    private async void ManageProfiles_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new ProfileManagerDialog(ViewModel.Profiles)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary)
            ViewModel.SaveProfiles(dialog.Profiles);
    }

    private void GroupsMenu_Opening(object sender, object e)
    {
        if (sender is not MenuFlyout flyout) return;
        flyout.Items.Clear();
        foreach (var group in ViewModel.Groups)
        {
            var item = new MenuFlyoutItem
            {
                Text = $"{group.Name}  ({group.ProjectPaths.Count})",
                Tag = group,
            };
            item.Click += LaunchGroup_Click;
            flyout.Items.Add(item);
        }
        if (ViewModel.Groups.Count > 0)
            flyout.Items.Add(new MenuFlyoutSeparator());
        var manage = new MenuFlyoutItem { Text = "Manage groups…" };
        manage.Click += ManageGroups_Click;
        flyout.Items.Add(manage);
    }

    private async void LaunchGroup_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuFlyoutItem { Tag: LaunchGroup group }) await ViewModel.LaunchGroupAsync(group);
    }

    private async void ManageGroups_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new GroupManagerDialog(ViewModel.Groups, ViewModel.AllProjects)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary)
            ViewModel.SaveGroups(dialog.Groups);
    }

    private void StopSession_Click(object sender, RoutedEventArgs e) =>
        ViewModel.StopSessionCommand.Execute(ItemOf(sender));

    private async void ResumeSession_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is not { } project) return;
        var sessions = ViewModel.ListSessions(project);
        if (sessions.Count == 0) { await _dialogs.ShowMessageAsync("Resume", "No past sessions found."); return; }
        var dialog = new ResumeSessionDialog(sessions) { XamlRoot = Content.XamlRoot, RequestedTheme = RootGrid.RequestedTheme };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary && dialog.SelectedSessionId is { } id)
            await ViewModel.ResumeSessionAsync(project, id);
    }

    private async void LaunchInWorktree_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is not { } project) return;
        var worktrees = await ViewModel.ListWorktreesAsync(project);
        var others = worktrees.Where(w => !w.IsBare).ToList();
        if (others.Count <= 1)
        {
            await _dialogs.ShowMessageAsync("Worktrees", "This project has no additional git worktrees.");
            return;
        }

        var dialog = new WorktreePickerDialog(others)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary && dialog.SelectedWorktree is { } wt)
            await ViewModel.LaunchInWorktreeAsync(project, wt);
    }

    private async void EditEnv_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is not { } project) return;
        var dialog = new EnvEditorDialog(ViewModel.ReadEnv(project))
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary)
            await ViewModel.WriteEnvAsync(project, dialog.ResultText);
    }

    private void OpenClaudeIgnore_Click(object sender, RoutedEventArgs e) =>
        ViewModel.OpenClaudeIgnoreCommand.Execute(ItemOf(sender));

    private void Rename_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is not { } project) return;
        _ = ShowRenameDialogAsync(project);
    }

    private void QuickPrompt_Click(object sender, RoutedEventArgs e)
    {
        if (ItemOf(sender) is { } project) _ = ShowQuickPromptDialogAsync(project);
    }

    private void QuickPrompt_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (DialogGate.AnyOpen || ViewModel.SelectedProject is null) return;
        args.Handled = true;
        _ = ShowQuickPromptDialogAsync(ViewModel.SelectedProject);
    }

    private void CommandPalette_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        _ = ShowCommandPaletteAsync();
    }

    private async Task ShowCommandPaletteAsync()
    {
        if (DialogGate.AnyOpen) return; // shared guard: both the Ctrl+P accelerator and the global hotkey route here
        var dialog = new CommandPaletteDialog(ViewModel.AllProjects)
        {
            XamlRoot = Content.XamlRoot,
            RequestedTheme = RootGrid.RequestedTheme,
        };
        await DialogGate.ShowAsync(dialog);
        if (dialog.ChosenProject is { } project)
            await ViewModel.LaunchFromPaletteAsync(project, dialog.ChosenIsNew);
    }

    private async Task ShowQuickPromptDialogAsync(ProjectItemViewModel project)
    {
        var dialog = new QuickPromptDialog { XamlRoot = Content.XamlRoot, RequestedTheme = RootGrid.RequestedTheme };
        if (await DialogGate.ShowAsync(dialog) == ContentDialogResult.Primary)
            await ViewModel.LaunchQuickPromptAsync(project, dialog.PromptText);
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

            if (entry is MenuFlyoutItem { Text: "Open CLAUDE.md" } claudeMd)
                claudeMd.Visibility = project.HasClaudeMd ? Visibility.Visible : Visibility.Collapsed;

            if (entry is MenuFlyoutItem { Text: "Stop session" } stop)
                stop.Visibility = project.IsRunning ? Visibility.Visible : Visibility.Collapsed;

            if (entry is MenuFlyoutItem { Text: "Launch in worktree…" } worktree)
                worktree.Visibility = project.HasGitInfo ? Visibility.Visible : Visibility.Collapsed;

            if (entry is MenuFlyoutSubItem { Text: "Project files" } projectFiles)
            {
                var hasIgnore = ClaudeIgnoreInfo.Has(project.Path);
                foreach (var sub in projectFiles.Items)
                {
                    if (sub is MenuFlyoutItem { Text: "Open .claudeignore" } openIgnore)
                        openIgnore.Visibility = hasIgnore ? Visibility.Visible : Visibility.Collapsed;
                }
            }

            if (entry is MenuFlyoutSubItem { Text: "Apply profile" } applyProfile)
            {
                applyProfile.Items.Clear();
                var profiles = ViewModel.Profiles;
                if (profiles.Count == 0)
                {
                    applyProfile.Items.Add(new MenuFlyoutItem
                    {
                        Text = "(no profiles — use “Profiles…”)",
                        IsEnabled = false,
                    });
                }
                else
                {
                    foreach (var profile in profiles)
                    {
                        var item = new MenuFlyoutItem
                        {
                            Text = profile.Name,
                            Tag = profile,
                            DataContext = project,
                        };
                        item.Click += ApplyProfile_Click;
                        applyProfile.Items.Add(item);
                    }
                }
            }

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
