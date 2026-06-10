using Ccmc.App.ViewModels;
using Ccmc.Core.Services;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.System;
using Windows.UI.Core;

namespace Ccmc.App.Views;

public sealed partial class CommandPaletteDialog : ContentDialog
{
    private readonly IReadOnlyList<ProjectItemViewModel> _allProjects;

    public ProjectItemViewModel? ChosenProject { get; private set; }
    public bool ChosenIsNew { get; private set; }

    public CommandPaletteDialog(IReadOnlyList<ProjectItemViewModel> allProjects)
    {
        InitializeComponent();
        _allProjects = allProjects;

        Opened += (_, _) =>
        {
            // Populate the list immediately so it's not empty before the user types.
            RefreshResults(string.Empty);
            QueryBox.Focus(FocusState.Programmatic);
        };
    }

    private void RefreshResults(string query)
    {
        var results = FuzzyMatcher.Rank(query, _allProjects, p => p.Name).Take(20).ToList();
        ResultsList.ItemsSource = results;
        if (results.Count > 0)
            ResultsList.SelectedIndex = 0;
    }

    private void QueryBox_TextChanged(object sender, TextChangedEventArgs e) =>
        RefreshResults(QueryBox.Text);

    private void QueryBox_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        var count = ResultsList.Items.Count;
        if (count == 0 && e.Key != VirtualKey.Escape) return;

        switch (e.Key)
        {
            case VirtualKey.Down:
                ResultsList.SelectedIndex = Math.Min(ResultsList.SelectedIndex + 1, count - 1);
                e.Handled = true;
                break;

            case VirtualKey.Up:
                ResultsList.SelectedIndex = Math.Max(ResultsList.SelectedIndex - 1, 0);
                e.Handled = true;
                break;

            case VirtualKey.Enter:
            {
                var project = EffectiveSelection();
                if (project is null) break;
                var ctrl = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control)
                    .HasFlag(CoreVirtualKeyStates.Down);
                ChosenProject = project;
                ChosenIsNew = ctrl;
                Hide();
                e.Handled = true;
                break;
            }

            case VirtualKey.Escape:
                Hide();
                e.Handled = true;
                break;
        }
    }

    private ProjectItemViewModel? EffectiveSelection() =>
        ResultsList.SelectedItem as ProjectItemViewModel
        ?? (ResultsList.Items.Count > 0 ? ResultsList.Items[0] as ProjectItemViewModel : null);
}
