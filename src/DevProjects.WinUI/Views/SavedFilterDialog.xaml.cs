using System.Collections.ObjectModel;
using DevProjects.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

/// <summary>
/// Create / edit / delete saved project filters. Mirrors ProfileManagerDialog:
/// a list with Add/Remove plus an editor panel; the whole set is returned on Save.
/// </summary>
public sealed partial class SavedFilterDialog : ContentDialog
{
    private readonly ObservableCollection<SavedFilter> _filters = [];
    private SavedFilter? _current;
    private bool _loading;

    /// <summary>The edited filter set, read by the caller after Save (Primary).</summary>
    public IReadOnlyList<SavedFilter> Filters => _filters;

    public SavedFilterDialog(IReadOnlyList<SavedFilter> filters, bool startWithNew = false)
    {
        InitializeComponent();

        // Deep-copy so edits are discarded on Cancel.
        foreach (var f in filters)
            _filters.Add(Clone(f));

        FilterList.ItemsSource = _filters;
        SetEditorEnabled(false);

        if (startWithNew)
        {
            var created = new SavedFilter { Name = NextFilterName() };
            _filters.Add(created);
            FilterList.SelectedItem = created;
        }
        else if (_filters.Count > 0)
        {
            FilterList.SelectedIndex = 0;
        }
    }

    private static SavedFilter Clone(SavedFilter f) => new()
    {
        Name = f.Name,
        PathContains = f.PathContains,
        RequireGit = f.RequireGit,
        RequireClaudeMd = f.RequireClaudeMd,
        RequireRunning = f.RequireRunning,
        RequirePinned = f.RequirePinned,
    };

    /// <summary>StackPanel has no IsEnabled (it isn't a Control), so toggle each editor field.</summary>
    private void SetEditorEnabled(bool enabled)
    {
        foreach (var child in EditorPanel.Children)
            if (child is Control control)
                control.IsEnabled = enabled;
    }

    private void FilterList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _current = FilterList.SelectedItem as SavedFilter;
        LoadEditor();
    }

    private void LoadEditor()
    {
        _loading = true;
        SetEditorEnabled(_current is not null);
        NameBox.Text = _current?.Name ?? "";
        PathContainsBox.Text = _current?.PathContains ?? "";
        RequireGitCheck.IsChecked = _current?.RequireGit ?? false;
        RequireClaudeMdCheck.IsChecked = _current?.RequireClaudeMd ?? false;
        RequireRunningCheck.IsChecked = _current?.RequireRunning ?? false;
        RequirePinnedCheck.IsChecked = _current?.RequirePinned ?? false;
        _loading = false;
    }

    private void AddButton_Click(object sender, RoutedEventArgs e)
    {
        var filter = new SavedFilter { Name = NextFilterName() };
        _filters.Add(filter);
        FilterList.SelectedItem = filter;
    }

    private string NextFilterName()
    {
        const string baseName = "New filter";
        if (_filters.All(f => f.Name != baseName)) return baseName;
        for (var i = 2; ; i++)
        {
            var candidate = $"{baseName} {i}";
            if (_filters.All(f => f.Name != candidate)) return candidate;
        }
    }

    private void RemoveButton_Click(object sender, RoutedEventArgs e)
    {
        if (_current is null) return;
        var index = _filters.IndexOf(_current);
        _filters.Remove(_current);
        if (_filters.Count == 0) FilterList.SelectedItem = null;
        else FilterList.SelectedIndex = Math.Min(index, _filters.Count - 1);
    }

    private void NameBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        // SavedFilter.Name is observable and the label binds OneWay, so it refreshes
        // on its own. Replacing the item / resetting selection per keystroke (the old
        // approach) stole focus from this TextBox and could spin the ListView layout.
        _current.Name = NameBox.Text;
    }

    private void PathContainsBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        var text = PathContainsBox.Text;
        _current.PathContains = string.IsNullOrWhiteSpace(text) ? null : text;
    }

    private void Condition_Changed(object sender, RoutedEventArgs e)
    {
        if (_loading || _current is null) return;
        _current.RequireGit = RequireGitCheck.IsChecked == true;
        _current.RequireClaudeMd = RequireClaudeMdCheck.IsChecked == true;
        _current.RequireRunning = RequireRunningCheck.IsChecked == true;
        _current.RequirePinned = RequirePinnedCheck.IsChecked == true;
    }
}
