using Microsoft.UI.Xaml.Controls;

namespace Ccmc.App.Views;

public sealed partial class DeleteProjectDialog : ContentDialog
{
    public DeleteProjectDialog(string name, string path, bool gitDirty, bool isRunning)
    {
        InitializeComponent();
        HeaderText.Text = $"Delete '{name}' and all its contents?";
        PathText.Text = path;
        DirtyBar.IsOpen = gitDirty;
        RunningBar.IsOpen = isRunning;
        // A live session holds file locks and the user may lose work — block outright.
        IsPrimaryButtonEnabled = !isRunning;
        PermanentCheck.IsEnabled = !isRunning;
    }

    public bool Permanent => PermanentCheck.IsChecked == true;
}
