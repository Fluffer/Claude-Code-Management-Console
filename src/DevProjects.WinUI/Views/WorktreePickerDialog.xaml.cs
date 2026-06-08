using DevProjects.Core.Models;
using Microsoft.UI.Xaml.Controls;

namespace DevProjects.App.Views;

public sealed partial class WorktreePickerDialog : ContentDialog
{
    private sealed record WorktreeDisplayItem(string Branch, string Path, GitWorktree Worktree);

    public GitWorktree? SelectedWorktree { get; private set; }

    public WorktreePickerDialog(IReadOnlyList<GitWorktree> worktrees)
    {
        InitializeComponent();

        var items = worktrees.Select(w => new WorktreeDisplayItem(
            w.Branch ?? "(detached)",
            w.Path,
            w)).ToList();

        WorktreeList.ItemsSource = items;
    }

    private void WorktreeList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (WorktreeList.SelectedItem is WorktreeDisplayItem item)
        {
            SelectedWorktree = item.Worktree;
            IsPrimaryButtonEnabled = true;
        }
        else
        {
            SelectedWorktree = null;
            IsPrimaryButtonEnabled = false;
        }
    }
}
