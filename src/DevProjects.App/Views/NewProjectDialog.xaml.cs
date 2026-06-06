using System.IO;
using System.Windows;
using System.Windows.Controls;
using DevProjects.App.ViewModels;
using DevProjects.Core.Services;

namespace DevProjects.App.Views;

public partial class NewProjectDialog : Window
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

        Loaded += (_, _) => NameBox.Focus();
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

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        if (RootCombo.SelectedItem is not string root)
        {
            MessageBox.Show("No destination root available. Add a source root in Settings first.",
                "New Project", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        var name = NameBox.Text.Trim();
        var error = ProjectNameValidator.GetError(name, root);
        if (error is not null)
        {
            ValidationText.Text = error;
            return;
        }

        string newPath;
        try
        {
            newPath = _viewModel.CreateProject(root, name);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or DirectoryNotFoundException)
        {
            MessageBox.Show($"Could not create folder: {ex.Message}", "New Project",
                MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }

        DialogResult = true;
        _viewModel.SelectProjectByPath(newPath);
        if (LaunchCheck.IsChecked == true)
            _viewModel.LaunchNewCommand.Execute(
                _viewModel.Projects.FirstOrDefault(p =>
                    string.Equals(p.Path, newPath, StringComparison.OrdinalIgnoreCase)));
    }
}
