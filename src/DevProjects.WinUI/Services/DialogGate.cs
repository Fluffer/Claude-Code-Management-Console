using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Services;

/// <summary>
/// Routes every ContentDialog through one place so (a) we never open two at
/// once (WinUI throws) and (b) window-level keyboard accelerators can no-op
/// while a dialog is open (they would otherwise still fire underneath it).
/// </summary>
internal static class DialogGate
{
    private static int _openCount;

    public static bool AnyOpen => _openCount > 0;

    public static async Task<ContentDialogResult> ShowAsync(ContentDialog dialog)
    {
        if (AnyOpen) return ContentDialogResult.None; // refuse to stack
        _openCount++;
        try { return await dialog.ShowAsync(); }
        finally { _openCount--; }
    }
}
