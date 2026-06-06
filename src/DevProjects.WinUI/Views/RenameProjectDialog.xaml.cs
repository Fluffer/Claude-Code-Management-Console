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
        _parentDir = System.IO.Path.GetDirectoryName(project.Path.TrimEnd('\\', '/')) ?? project.Root;

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
