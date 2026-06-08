using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using DevProjects.Core.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

/// <summary>
/// Structured editor for a project's .env. Values are masked by default (PasswordBox); a per-row
/// reveal toggle is transient. On Save the edits are folded back over the ORIGINAL file text with
/// EnvFileEditor.SetKey/RemoveKey so comments and line order survive. .env contents are never logged.
/// </summary>
public sealed partial class EnvEditorDialog : ContentDialog
{
    private readonly string _originalText;

    public ObservableCollection<EnvRowViewModel> Rows { get; } = [];

    /// <summary>The edited .env text, valid after the dialog closes with Primary.</summary>
    public string ResultText { get; private set; } = "";

    public EnvEditorDialog(string envText)
    {
        _originalText = envText ?? "";
        InitializeComponent();

        foreach (var entry in EnvFileEditor.Parse(_originalText))
            Rows.Add(new EnvRowViewModel(entry.Key, entry.Value));

        PrimaryButtonClick += OnPrimaryButtonClick;
    }

    private void Add_Click(object sender, RoutedEventArgs e)
    {
        var key = NewKeyBox.Text.Trim();
        if (key.Length == 0) return;
        var existing = Rows.FirstOrDefault(r =>
            string.Equals(r.Key, key, StringComparison.Ordinal));
        if (existing is not null)
            existing.Value = NewValueBox.Text;
        else
            Rows.Add(new EnvRowViewModel(key, NewValueBox.Text));
        NewKeyBox.Text = "";
        NewValueBox.Text = "";
    }

    private void Remove_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { Tag: EnvRowViewModel row })
            Rows.Remove(row);
    }

    private void OnPrimaryButtonClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var text = _originalText;

        // Drop keys the user removed (present originally, gone from the edited rows).
        var keptKeys = new HashSet<string>(Rows.Select(r => r.Key), StringComparer.Ordinal);
        foreach (var entry in EnvFileEditor.Parse(_originalText))
        {
            if (!keptKeys.Contains(entry.Key))
                text = EnvFileEditor.RemoveKey(text, entry.Key);
        }

        // Update/append surviving rows in order, preserving comments and untouched lines.
        foreach (var row in Rows)
            text = EnvFileEditor.SetKey(text, row.Key, row.Value);

        ResultText = text;
    }
}

/// <summary>One editable .env row. Value is masked in the UI; reveal is transient (per row).</summary>
public sealed partial class EnvRowViewModel : ObservableObject
{
    [ObservableProperty] private string _key;
    [ObservableProperty] private string _value;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RevealMode))]
    private bool _isRevealed;

    public EnvRowViewModel(string key, string value)
    {
        _key = key;
        _value = value;
    }

    public PasswordRevealMode RevealMode =>
        IsRevealed ? PasswordRevealMode.Visible : PasswordRevealMode.Hidden;
}
