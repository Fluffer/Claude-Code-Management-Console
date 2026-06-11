using Ccmc.App.ViewModels;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Windows.Storage.Pickers;

namespace Ccmc.App.Views;

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
        ThemeCombo.ItemsSource = _viewModel.Themes;
        ThemeCombo.SelectedItem = _viewModel.Themes.FirstOrDefault(t => t == _viewModel.Theme) ?? "System";
        AccentCombo.ItemsSource = _viewModel.AccentOptions;
        AccentCombo.SelectedItem = _viewModel.AccentOptions.FirstOrDefault(a => a == _viewModel.Accent) ?? "Default";
        FontCombo.ItemsSource = _viewModel.FontOptions;
        FontCombo.SelectedItem = _viewModel.FontOptions.FirstOrDefault(f => f == _viewModel.Font) ?? "Segoe UI Variable";
        CloseToTrayToggle.IsOn = _viewModel.CloseToTray;
    }

    private void RefreshLists()
    {
        _loading = true;
        var roots = (_viewModel.Config.Roots ?? []).ToList();
        RootsList.ItemsSource = roots;
        DefaultCombo.ItemsSource = roots;
        DefaultCombo.SelectedItem = roots.FirstOrDefault(r =>
            string.Equals(r, _viewModel.Config.DefaultRoot, StringComparison.OrdinalIgnoreCase));
        var hidden = _viewModel.HiddenProjects;
        HiddenList.ItemsSource = hidden;
        var hasHidden = hidden.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        HiddenHeader.Visibility = hasHidden;
        HiddenGrid.Visibility = hasHidden;
        _loading = false;
    }

    private async void AddButton_Click(object sender, RoutedEventArgs e)
    {
        try
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
        catch (Exception ex)
        {
            // Picker COM failures / config-save IO errors must not take the
            // app down. Queued via the gate; shows after this dialog closes.
            var dialog = new ContentDialog
            {
                XamlRoot = XamlRoot,
                Title = "Settings",
                Content = new TextBlock { Text = $"Could not add the folder: {ex.Message}", TextWrapping = TextWrapping.Wrap },
                CloseButtonText = "OK",
            };
            _ = Services.DialogGate.ShowAsync(dialog);
        }
    }

    private void RemoveButton_Click(object sender, RoutedEventArgs e)
    {
        if (RootsList.SelectedItem is not string root) return;
        _viewModel.RemoveRoot(root);
        RefreshLists();
    }

    private void RestoreButton_Click(object sender, RoutedEventArgs e)
    {
        if (HiddenList.SelectedItem is not string path) return;
        _viewModel.RestoreHidden(path);
        RefreshLists();
    }

    private void DefaultCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (DefaultCombo.SelectedItem is string root)
            _viewModel.SetDefaultRoot(root);
    }

    private void ThemeCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ThemeCombo.SelectedItem is string theme) _viewModel.Theme = theme;
    }

    private void AccentCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (AccentCombo.SelectedItem is string accent) _viewModel.Accent = accent;
    }

    private void FontCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (FontCombo.SelectedItem is string font) _viewModel.Font = font;
    }

    private void CloseToTrayToggle_Toggled(object sender, RoutedEventArgs e)
    {
        _viewModel.CloseToTray = CloseToTrayToggle.IsOn;
    }
}
