using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using DevProjects.App.ViewModels;
using DevProjects.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

public sealed partial class GroupManagerDialog : ContentDialog
{
    private readonly ObservableCollection<LaunchGroup> _groups = [];
    private readonly List<ProjectCheckItem> _projectItems;
    private LaunchGroup? _current;
    private bool _loading;

    /// <summary>The edited group set, read by the caller after Save (Primary).</summary>
    public IReadOnlyList<LaunchGroup> Groups => _groups;

    public GroupManagerDialog(IReadOnlyList<LaunchGroup> groups, IReadOnlyList<ProjectItemViewModel> allProjects)
    {
        InitializeComponent();

        // Deep-copy so edits are discarded on Cancel.
        foreach (var g in groups)
            _groups.Add(new LaunchGroup { Name = g.Name, ProjectPaths = [.. g.ProjectPaths] });

        _projectItems = allProjects
            .Select(p => new ProjectCheckItem(p.Path, $"{p.Name}  —  {p.RootName}"))
            .ToList();
        foreach (var item in _projectItems)
            item.PropertyChanged += ProjectItem_PropertyChanged;

        GroupList.ItemsSource = _groups;
        ProjectList.ItemsSource = _projectItems;
        SetEditorEnabled(false);
        if (_groups.Count > 0) GroupList.SelectedIndex = 0;
    }

    private void SetEditorEnabled(bool enabled)
    {
        NameBox.IsEnabled = enabled;
        ProjectList.IsEnabled = enabled;
    }

    private void GroupList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _current = GroupList.SelectedItem as LaunchGroup;
        LoadEditor();
    }

    private void LoadEditor()
    {
        _loading = true;
        SetEditorEnabled(_current is not null);
        NameBox.Text = _current?.Name ?? "";
        var paths = _current?.ProjectPaths ?? [];
        foreach (var item in _projectItems)
            item.IsChecked = paths.Contains(item.Path, StringComparer.OrdinalIgnoreCase);
        _loading = false;
    }

    private void ProjectItem_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (_loading || _current is null || sender is not ProjectCheckItem item) return;
        if (e.PropertyName != nameof(ProjectCheckItem.IsChecked)) return;

        if (item.IsChecked)
        {
            // Preserve check order: append only if not already present.
            if (!_current.ProjectPaths.Contains(item.Path, StringComparer.OrdinalIgnoreCase))
                _current.ProjectPaths.Add(item.Path);
        }
        else
        {
            _current.ProjectPaths.RemoveAll(p => string.Equals(p, item.Path, StringComparison.OrdinalIgnoreCase));
        }
    }

    private void AddButton_Click(object sender, RoutedEventArgs e)
    {
        var group = new LaunchGroup { Name = NextGroupName() };
        _groups.Add(group);
        GroupList.SelectedItem = group;
    }

    private string NextGroupName()
    {
        const string baseName = "New group";
        if (_groups.All(g => g.Name != baseName)) return baseName;
        for (var i = 2; ; i++)
        {
            var candidate = $"{baseName} {i}";
            if (_groups.All(g => g.Name != candidate)) return candidate;
        }
    }

    private void RemoveButton_Click(object sender, RoutedEventArgs e)
    {
        if (_current is null) return;
        var index = _groups.IndexOf(_current);
        _groups.Remove(_current);
        if (_groups.Count == 0) GroupList.SelectedItem = null;
        else GroupList.SelectedIndex = Math.Min(index, _groups.Count - 1);
    }

    private void NameBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        _current.Name = NameBox.Text;
        // The list label is bound, so refresh that row in place (keeping selection).
        var index = _groups.IndexOf(_current);
        if (index >= 0)
        {
            _groups[index] = _current;
            GroupList.SelectedIndex = index;
        }
    }

    /// <summary>A project row with a two-way checkbox state, used only inside this dialog.</summary>
    private sealed partial class ProjectCheckItem : ObservableObject
    {
        public string Path { get; }
        public string Label { get; }

        [ObservableProperty]
        private bool _isChecked;

        public ProjectCheckItem(string path, string label)
        {
            Path = path;
            Label = label;
        }
    }
}
