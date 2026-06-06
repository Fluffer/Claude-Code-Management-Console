using System.Windows;
using DevProjects.Core.Services;

namespace DevProjects.App.Views;

public partial class HelpWindow : Window
{
    public HelpWindow()
    {
        InitializeComponent();
        FlagList.ItemsSource = ClaudeFlagCatalog.Presets;
    }
}
