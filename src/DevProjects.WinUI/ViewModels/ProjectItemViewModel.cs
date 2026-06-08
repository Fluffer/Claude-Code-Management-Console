using CommunityToolkit.Mvvm.ComponentModel;
using DevProjects.Core.Models;
using DevProjects.Core.Services;

namespace DevProjects.App.ViewModels;

/// <summary>One row in the project list.</summary>
public sealed partial class ProjectItemViewModel : ObservableObject
{
    public ProjectInfo Info { get; }

    public string Name => Info.Name;
    public string Root => Info.Root;
    public string RootName => System.IO.Path.GetFileName(Info.Root.TrimEnd('\\', '/'));
    public string Path => Info.Path;
    public DateTime? LastUsedUtc => Info.LastUsedUtc;
    public string LastUsedText => RelativeTimeFormatter.Format(Info.LastUsedUtc);

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CurrentModel))]
    [NotifyPropertyChangedFor(nameof(CurrentModelLabel))]
    private string _flags;

    /// <summary>
    /// The project's configured default model (from .claude/settings.json), resolved
    /// during enrichment. Null when none is set. Surfaced on the picker when there is
    /// no explicit <c>--model</c> override in the flags.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CurrentModelLabel))]
    private string? _defaultModel;

    /// <summary>The explicit <c>--model</c> override in this project's flags, if any.</summary>
    public string? CurrentModel => FlagsEditor.CurrentModel(Flags);

    /// <summary>Override wins; else the settings.json default; else "Default" (Claude's built-in choice).</summary>
    public string CurrentModelLabel => CurrentModel ?? DefaultModel ?? "Default";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PinGlyph))]
    [NotifyPropertyChangedFor(nameof(PinOpacity))]
    private bool _isPinned;

    /// <summary>Segoe Fluent glyph: FavoriteStarFill (E735) when pinned, FavoriteStar (E734) otherwise.</summary>
    public string PinGlyph => IsPinned ? "" : "";

    public double PinOpacity => IsPinned ? 1.0 : 0.55;

    /// <summary>
    /// Whether a previous Claude session exists for this folder. Defaults to
    /// true (Continue enabled) until detection completes — detection is
    /// best-effort advice, never a hard gate.
    /// </summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ContinueToolTip))]
    private bool _hasSession = true;

    /// <summary>
    /// "A Claude session is active here right now": a claude process with this
    /// folder as its working directory was detected (or, as a fallback, the
    /// session transcript was written within the last 2 minutes).
    /// </summary>
    [ObservableProperty]
    private bool _isRunning;

    /// <summary>Whether a CLAUDE.md file exists in this project folder.</summary>
    [ObservableProperty]
    private bool _hasClaudeMd;

    public string RunningToolTip =>
        "A Claude session is running in this folder right now";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasGitInfo))]
    private string? _gitBranch;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(GitToolTip))]
    private bool? _gitDirty;

    public bool HasGitInfo => GitBranch is not null;

    public string GitToolTip => GitDirty switch
    {
        true => $"Git branch '{GitBranch}' — has uncommitted changes",
        false => $"Git branch '{GitBranch}' — working tree clean",
        null => $"Git branch '{GitBranch}'",
    };

    public string ContinueToolTip => HasSession
        ? "Resume the most recent Claude session in this project (claude --continue)"
        : "No previous Claude session was found for this folder — use New to start one";

    public string PinToolTip => IsPinned
        ? "Unpin this project"
        : "Pin this project to the top of the list";

    public ProjectItemViewModel(ProjectInfo info, bool isPinned)
    {
        Info = info;
        _flags = info.Flags;
        _isPinned = isPinned;
    }

    partial void OnIsPinnedChanged(bool value) => OnPropertyChanged(nameof(PinToolTip));
}
