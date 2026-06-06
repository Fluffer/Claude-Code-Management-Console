using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using DevProjects.App.ViewModels;
using DevProjects.App.Views;

namespace DevProjects.App;

public partial class MainWindow : Window
{
    public static readonly RoutedCommand FocusSearchCmd = new();
    public static readonly RoutedCommand NewProjectCmd = new();
    public static readonly RoutedCommand RefreshCmd = new();
    public static readonly RoutedCommand HelpCmd = new();

    private readonly MainViewModel _viewModel;
    private readonly DispatcherTimer _toastTimer;

    public MainWindow()
    {
        InitializeComponent();
        _viewModel = new MainViewModel(Dispatcher);
        DataContext = _viewModel;
        _viewModel.ToastRequested += ShowToast;

        _toastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2.6) };
        _toastTimer.Tick += (_, _) => { _toastTimer.Stop(); Toast.Visibility = Visibility.Collapsed; };

        CommandBindings.Add(new CommandBinding(FocusSearchCmd, (_, _) => { SearchBox.Focus(); SearchBox.SelectAll(); }));
        CommandBindings.Add(new CommandBinding(NewProjectCmd, (_, _) => ShowNewProjectDialog()));
        CommandBindings.Add(new CommandBinding(RefreshCmd, (_, _) => _viewModel.RescanCommand.Execute(null)));
        CommandBindings.Add(new CommandBinding(HelpCmd, (_, _) => ShowHelp()));

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape && !string.IsNullOrEmpty(_viewModel.SearchText))
            {
                _viewModel.SearchText = "";
                e.Handled = true;
            }
        };

        SyncSortCombo();
        Closed += (_, _) => _viewModel.Shutdown();
    }

    // ---------- Toast ----------

    private void ShowToast(string message)
    {
        ToastText.Text = message;
        Toast.Visibility = Visibility.Visible;
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    // ---------- Sort combo (maps friendly labels to VM sort keys) ----------

    private void SyncSortCombo()
    {
        foreach (ComboBoxItem item in SortCombo.Items)
        {
            if ((string)item.Tag == _viewModel.SortMode)
            {
                SortCombo.SelectedItem = item;
                return;
            }
        }
        SortCombo.SelectedIndex = 0;
    }

    private void SortCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SortCombo.SelectedItem is ComboBoxItem item && item.Tag is string mode)
            _viewModel.SortMode = mode;
    }

    // ---------- Flags builder ----------

    private void AddFlagButton_Click(object sender, RoutedEventArgs e)
    {
        var menu = new ContextMenu { PlacementTarget = AddFlagButton };
        foreach (var preset in _viewModel.FlagPresets)
        {
            var item = new MenuItem
            {
                Header = preset.Display,
                ToolTip = preset.Description,
                CommandParameter = preset,
                Command = _viewModel.InsertFlagCommand,
            };
            menu.Items.Add(item);
        }
        menu.IsOpen = true;
    }

    // ---------- Project list keyboard: Enter = Continue, Ctrl+Enter = New ----------

    private void ProjectList_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter || _viewModel.SelectedProject is null) return;
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Control))
            _viewModel.LaunchNewCommand.Execute(_viewModel.SelectedProject);
        else if (_viewModel.SelectedProject.HasSession)
            _viewModel.LaunchContinueCommand.Execute(_viewModel.SelectedProject);
        else
            _viewModel.LaunchNewCommand.Execute(_viewModel.SelectedProject);
        e.Handled = true;
    }

    // ---------- Context menu: row targeting, rename, move ----------

    private void ListViewItem_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is ListViewItem item) item.IsSelected = true;
    }

    private void RenameMenuItem_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as MenuItem)?.DataContext is not ProjectItemViewModel project) return;
        var dialog = new RenameProjectDialog(_viewModel, project) { Owner = this };
        dialog.ShowDialog();
    }

    private void MoveToRootMenu_SubmenuOpened(object sender, RoutedEventArgs e)
    {
        if (sender is not MenuItem menu) return;
        menu.Items.Clear();
        var targets = _viewModel.MoveTargetRoots;
        if (targets.Count == 0)
        {
            menu.Items.Add(new MenuItem { Header = "(no roots available)", IsEnabled = false });
            return;
        }
        var currentRoot = (menu.DataContext as ProjectItemViewModel)?.Root;
        foreach (var root in targets)
        {
            var item = new MenuItem
            {
                Header = root,
                IsEnabled = !string.Equals(root, currentRoot, StringComparison.OrdinalIgnoreCase),
                ToolTip = $"Move the project folder into {root}",
            };
            var captured = root;
            item.Click += (_, _) => _viewModel.MoveSelectedToRootCommand.Execute(captured);
            menu.Items.Add(item);
        }
    }

    // ---------- Dialogs ----------

    private void NewProjectButton_Click(object sender, RoutedEventArgs e) => ShowNewProjectDialog();

    private void ShowNewProjectDialog()
    {
        var dialog = new NewProjectDialog(_viewModel) { Owner = this };
        dialog.ShowDialog();
    }

    private void SettingsButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SettingsDialog(_viewModel) { Owner = this };
        dialog.ShowDialog();
        _viewModel.RescanCommand.Execute(null);
    }

    private void HelpButton_Click(object sender, RoutedEventArgs e) => ShowHelp();

    private void ShowHelp()
    {
        var help = new HelpWindow { Owner = this };
        help.ShowDialog();
    }

    // ---------- Drag & drop ----------

    private static string? GetDroppedFolder(DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return null;
        var paths = (string[]?)e.Data.GetData(DataFormats.FileDrop);
        var first = paths?.FirstOrDefault();
        return first is not null && Directory.Exists(first) ? first : null;
    }

    private void Window_DragOver(object sender, DragEventArgs e)
    {
        var folder = GetDroppedFolder(e);
        e.Effects = folder is null ? DragDropEffects.None : DragDropEffects.Link;
        DropOverlay.Visibility = folder is null ? Visibility.Collapsed : Visibility.Visible;
        e.Handled = true;
    }

    private void Window_DragLeave(object sender, DragEventArgs e)
    {
        DropOverlay.Visibility = Visibility.Collapsed;
    }

    private void Window_Drop(object sender, DragEventArgs e)
    {
        DropOverlay.Visibility = Visibility.Collapsed;
        var folder = GetDroppedFolder(e);
        if (folder is null) return;

        if (_viewModel.IsKnownRootChild(folder))
        {
            // Already a scannable project — just select it.
            _viewModel.RescanCommand.Execute(null);
            _viewModel.SelectProjectByPath(folder);
            return;
        }

        var dialog = new DropChoiceDialog(folder) { Owner = this };
        if (dialog.ShowDialog() != true) return;
        switch (dialog.Choice)
        {
            case DropChoice.AddAsRoot:
                _viewModel.AddRoot(folder);
                break;
            case DropChoice.LaunchHere:
                _viewModel.LaunchInFolder(folder);
                break;
        }
    }
}
