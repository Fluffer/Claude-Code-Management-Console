using System.IO;
using System.Windows;
using System.Windows.Controls;
using DevProjects.App.ViewModels;
using DevProjects.Core.Services;

namespace DevProjects.App.Views;

public partial class RenameProjectDialog : Window
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
        Loaded += (_, _) => { NameBox.Focus(); NameBox.SelectAll(); };
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

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        var name = NameBox.Text.Trim();
        if (name == _project.Name) { DialogResult = false; return; }
        var error = ProjectNameValidator.GetError(name, _parentDir);
        if (error is not null) { ValidationText.Text = error; return; }

        try
        {
            _viewModel.RenameProject(_project, name);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException)
        {
            MessageBox.Show($"Could not rename: {ex.Message}\n\n" +
                "If a Claude session or another program has files open in this folder, close it and try again.",
                "Rename Project", MessageBoxButton.OK, MessageBoxImage.Error);
            return;
        }
        DialogResult = true;
    }
}
