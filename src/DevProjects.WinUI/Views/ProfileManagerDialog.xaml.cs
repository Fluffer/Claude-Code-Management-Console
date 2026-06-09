using System.Collections.ObjectModel;
using DevProjects.Core.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

public sealed partial class ProfileManagerDialog : ContentDialog
{
    private static readonly string[] ModelOptions = ["Default", "sonnet", "opus", "haiku"];
    private static readonly string[] PermissionOptions = ["none", "default", "acceptEdits", "bypassPermissions", "plan"];

    private readonly ObservableCollection<LaunchProfile> _profiles = [];
    private LaunchProfile? _current;
    private bool _loading;

    /// <summary>The edited profile set, read by the caller after Save (Primary).</summary>
    public IReadOnlyList<LaunchProfile> Profiles => _profiles;

    public ProfileManagerDialog(IReadOnlyList<LaunchProfile> profiles)
    {
        InitializeComponent();

        // Deep-copy so edits are discarded on Cancel.
        foreach (var p in profiles)
            _profiles.Add(new LaunchProfile
            {
                Name = p.Name,
                Model = p.Model,
                PermissionMode = p.PermissionMode,
                AllowedTools = [.. p.AllowedTools],
                DisallowedTools = [.. p.DisallowedTools],
            });

        ModelCombo.ItemsSource = ModelOptions;
        PermissionCombo.ItemsSource = PermissionOptions;
        ProfileList.ItemsSource = _profiles;
        SetEditorEnabled(false);
        if (_profiles.Count > 0) ProfileList.SelectedIndex = 0;
    }

    /// <summary>StackPanel has no IsEnabled (it isn't a Control), so toggle each editor field.</summary>
    private void SetEditorEnabled(bool enabled)
    {
        foreach (var child in EditorPanel.Children)
            if (child is Control control)
                control.IsEnabled = enabled;
    }

    private void ProfileList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _current = ProfileList.SelectedItem as LaunchProfile;
        LoadEditor();
    }

    private void LoadEditor()
    {
        _loading = true;
        SetEditorEnabled(_current is not null);
        NameBox.Text = _current?.Name ?? "";
        ModelCombo.SelectedItem = string.IsNullOrWhiteSpace(_current?.Model) ? "Default" : _current!.Model;
        PermissionCombo.SelectedItem = string.IsNullOrWhiteSpace(_current?.PermissionMode) ? "none" : _current!.PermissionMode;
        AllowedBox.Text = _current is null ? "" : string.Join(' ', _current.AllowedTools);
        DisallowedBox.Text = _current is null ? "" : string.Join(' ', _current.DisallowedTools);
        _loading = false;
    }

    private void AddButton_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        var profile = new LaunchProfile { Name = NextProfileName() };
        _profiles.Add(profile);
        ProfileList.SelectedItem = profile;
    }

    private string NextProfileName()
    {
        const string baseName = "New profile";
        if (_profiles.All(p => p.Name != baseName)) return baseName;
        for (var i = 2; ; i++)
        {
            var candidate = $"{baseName} {i}";
            if (_profiles.All(p => p.Name != candidate)) return candidate;
        }
    }

    private void RemoveButton_Click(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
    {
        if (_current is null) return;
        var index = _profiles.IndexOf(_current);
        _profiles.Remove(_current);
        if (_profiles.Count == 0) ProfileList.SelectedItem = null;
        else ProfileList.SelectedIndex = Math.Min(index, _profiles.Count - 1);
    }

    private void NameBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        // LaunchProfile.Name is observable and the label binds OneWay (classic Binding),
        // so it refreshes on its own. Replacing the item / resetting selection per
        // keystroke (the old approach) stole focus from this TextBox and could spin
        // the ListView layout.
        _current.Name = NameBox.Text;
    }

    private void ModelCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        var model = ModelCombo.SelectedItem as string;
        _current.Model = string.IsNullOrWhiteSpace(model) || model == "Default" ? null : model;
    }

    private void PermissionCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        var mode = PermissionCombo.SelectedItem as string;
        _current.PermissionMode = string.IsNullOrWhiteSpace(mode) || mode == "none" ? null : mode;
    }

    private void AllowedBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        _current.AllowedTools = SplitTokens(AllowedBox.Text);
    }

    private void DisallowedBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_loading || _current is null) return;
        _current.DisallowedTools = SplitTokens(DisallowedBox.Text);
    }

    private static List<string> SplitTokens(string text) =>
        text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).ToList();
}
