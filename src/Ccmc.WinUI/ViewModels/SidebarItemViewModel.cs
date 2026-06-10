using Ccmc.Core.Models;

namespace Ccmc.App.ViewModels;

/// <summary>
/// An entry in the sidebar. Three kinds:
/// a root filter (<see cref="Root"/> non-null), the "All" entry (both null),
/// or a saved-filter entry (<see cref="Filter"/> non-null).
/// </summary>
public sealed record SidebarItemViewModel(string DisplayName, string? Root, bool Enabled, string ToolTip)
{
    /// <summary>When non-null, this entry narrows the list with a saved project filter.</summary>
    public SavedFilter? Filter { get; init; }
}
