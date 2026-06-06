using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Services;

/// <summary>
/// Routes every ContentDialog through one place so (a) we never open two at
/// once (WinUI throws) — later callers wait their turn — and (b) window-level
/// keyboard accelerators can no-op while a dialog is open (they would
/// otherwise still fire underneath it).
/// </summary>
internal static class DialogGate
{
    private static int _openCount;

    public static bool AnyOpen => _openCount > 0;

    public static async Task<ContentDialogResult> ShowAsync(ContentDialog dialog)
    {
        // Wait for any open dialog to close (WinUI allows only one at a time).
        // NEVER await this from inside an open dialog's button-click handler —
        // the dialog only closes after the handler returns, so that would
        // deadlock. Fire-and-forget (`_ = ...`) from such handlers is safe:
        // the queued dialog shows right after the current one closes.
        while (AnyOpen) await Task.Delay(50);
        _openCount++;
        try { return await dialog.ShowAsync(); }
        finally { _openCount--; }
    }
}
