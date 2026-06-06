using Microsoft.UI.Xaml;

namespace DevProjects.App;

/// <summary>
/// The application window.
/// </summary>
public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

        AppWindow.SetIcon("Assets/app.ico");
    }
}
