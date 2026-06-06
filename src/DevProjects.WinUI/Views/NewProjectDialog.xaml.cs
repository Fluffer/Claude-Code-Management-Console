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
