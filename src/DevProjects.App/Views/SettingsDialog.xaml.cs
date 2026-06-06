using System.Windows;
using System.Windows.Controls;
using DevProjects.App.ViewModels;
using Microsoft.Win32;

namespace DevProjects.App.Views;

public partial class SettingsDialog : Window
{
    private readonly MainViewModel _viewModel;
    private bool _loading;

    public SettingsDialog(MainViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
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

    private void AddButton_Click(object sender, RoutedEventArgs e)
    {
        var picker = new OpenFolderDialog
        {
            Title = "Choose a folder containing projects",
        };
        if (picker.ShowDialog(this) == true)
        {
            _viewModel.AddRoot(picker.FolderName);
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
