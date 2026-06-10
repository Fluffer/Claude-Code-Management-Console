using Ccmc.Core.Models;
using Microsoft.UI.Xaml.Controls;

namespace Ccmc.App.Views;

/// <summary>Read-only viewer for a project's .mcp.json servers (Close only — no edits).</summary>
public sealed partial class McpViewerDialog : ContentDialog
{
    public McpViewerDialog(IReadOnlyList<McpServerInfo> servers)
    {
        InitializeComponent();
        ServerList.ItemsSource = servers;
    }
}
