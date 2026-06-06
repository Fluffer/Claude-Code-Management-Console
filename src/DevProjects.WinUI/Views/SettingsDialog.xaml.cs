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

    private void DefaultCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading) return;
        if (DefaultCombo.SelectedItem is string root)
            _viewModel.SetDefaultRoot(root);
    }
}
