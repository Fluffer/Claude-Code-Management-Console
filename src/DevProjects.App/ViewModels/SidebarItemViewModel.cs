namespace DevProjects.App.ViewModels;

/// <summary>A root filter entry in the sidebar ("All" has a null Root).</summary>
public sealed record SidebarItemViewModel(string DisplayName, string? Root, bool Enabled, string ToolTip);
