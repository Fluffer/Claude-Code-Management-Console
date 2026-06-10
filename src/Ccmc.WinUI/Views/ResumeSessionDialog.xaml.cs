using Ccmc.Core.Models;
using Ccmc.Core.Services;
using Microsoft.UI.Xaml.Controls;

namespace Ccmc.App.Views;

public sealed partial class ResumeSessionDialog : ContentDialog
{
    private sealed record SessionDisplayItem(string Display, string RelativeTime, string SessionId);

    public string? SelectedSessionId { get; private set; }

    public ResumeSessionDialog(IReadOnlyList<SessionSummary> sessions)
    {
        InitializeComponent();

        var items = sessions.Select(s => new SessionDisplayItem(
            string.IsNullOrWhiteSpace(s.FirstUserMessage) ? s.SessionId : s.FirstUserMessage,
            RelativeTimeFormatter.Format(s.LastWriteUtc),
            s.SessionId)).ToList();

        SessionList.ItemsSource = items;
    }

    private void SessionList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (SessionList.SelectedItem is SessionDisplayItem item)
        {
            SelectedSessionId = item.SessionId;
            IsPrimaryButtonEnabled = true;
        }
        else
        {
            SelectedSessionId = null;
            IsPrimaryButtonEnabled = false;
        }
    }
}
