using System.Windows;

namespace DevProjects.App.Views;

public enum DropChoice { None, AddAsRoot, LaunchHere }

public partial class DropChoiceDialog : Window
{
    public DropChoice Choice { get; private set; } = DropChoice.None;

    public DropChoiceDialog(string folderPath)
    {
        InitializeComponent();
        FolderText.Text = folderPath;
    }

    private void AddRoot_Click(object sender, RoutedEventArgs e)
    {
        Choice = DropChoice.AddAsRoot;
        DialogResult = true;
    }

    private void Launch_Click(object sender, RoutedEventArgs e)
    {
        Choice = DropChoice.LaunchHere;
        DialogResult = true;
    }
}
