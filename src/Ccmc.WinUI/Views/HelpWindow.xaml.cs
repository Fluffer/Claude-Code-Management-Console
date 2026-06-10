using Ccmc.Core.Services;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using System.Runtime.InteropServices;
using Windows.Graphics;

namespace Ccmc.App.Views;

public sealed partial class HelpWindow : Window
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    public HelpWindow()
    {
        InitializeComponent();
        FlagList.ItemsSource = ClaudeFlagCatalog.Presets;

        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var scale = GetDpiForWindow(hwnd) / 96.0;
        var width = (int)(680 * scale);
        var height = (int)(640 * scale);
        AppWindow.Resize(new SizeInt32(width, height));
        var area = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        AppWindow.Move(new PointInt32(
            area.X + (area.Width - width) / 2,
            area.Y + (area.Height - height) / 2));
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
