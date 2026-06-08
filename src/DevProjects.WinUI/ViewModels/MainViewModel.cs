using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using Microsoft.UI.Dispatching;
using Windows.ApplicationModel.DataTransfer;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using DevProjects.App.Services;
using DevProjects.Core.Models;
using DevProjects.Core.Services;

namespace DevProjects.App.ViewModels;

public sealed partial class MainViewModel : ObservableObject
{
    private readonly ConfigService _configService;
    private readonly StateService _stateService;
    private readonly IClaudeSessionDetector _sessionDetector;
    private readonly GitInfoProvider _gitInfoProvider;
    private readonly ClaudeCliService _claudeCli;
    private readonly DispatcherQueue _dispatcherQueue;
    private readonly IUserDialogs _dialogs;
    private readonly List<FileSystemWatcher> _watchers = [];
    private readonly DispatcherQueueTimer _watcherDebounce;

    private LauncherConfig _config;
    private AppState _state;
    private IReadOnlyList<ProjectInfo> _allProjects = [];
    private CancellationTokenSource? _enrichmentCts;
    private bool _loadingFlags;
    private bool _suppressFilter;
    private readonly DispatcherQueueTimer _flagsSaveDebounce;
    private DispatcherQueueTimer _runningRefreshTimer = null!;
    private (string Path, string Flags)? _pendingFlagsSave;

    private readonly RunningClaudeDetector _runningDetector = new();
    private readonly ClaudeSessionLister _sessionLister = new();

    /// <summary>
    /// Fallback signal only: how recent a transcript write still counts as
    /// "running" when no matching claude process is found (e.g. process scan
    /// blocked). The primary signal is a live claude process cwd match.
    /// </summary>
    private static readonly TimeSpan TranscriptFallbackWindow = TimeSpan.FromMinutes(2);

    public ObservableCollection<SidebarItemViewModel> SidebarItems { get; } = [];
    public ObservableCollection<ProjectItemViewModel> Projects { get; } = [];
    public IReadOnlyList<FlagPreset> FlagPresets => ClaudeFlagCatalog.Presets;

    [ObservableProperty] private SidebarItemViewModel? _selectedSidebarItem;
    [ObservableProperty] private ProjectItemViewModel? _selectedProject;
    [ObservableProperty] private string _searchText = "";
    [ObservableProperty] private string _flagsText = "";
    [ObservableProperty] private bool _flagsEnabled;
    [ObservableProperty] private string _statusText = "";
    [ObservableProperty] private string _runningSummary = "";
    [ObservableProperty] private bool _anySessionRunning;
    [ObservableProperty] private string _claudeVersionText = "claude: checking…";
    [ObservableProperty] private bool _claudeMissing;
    [ObservableProperty] private bool _showOnboarding;
    [ObservableProperty] private string _updateNudgeText = "";
    [ObservableProperty] private bool _updateAvailable;
    [ObservableProperty] private string _emptyStateText = "";
    [ObservableProperty] private bool _isListEmpty;

    /// <summary>"LastUsed" or "Name".</summary>
    [ObservableProperty] private string _sortMode = "LastUsed";

    /// <summary>"System", "Light", "Dark", or a palette name (e.g. "Dracula", "Nord").</summary>
    [ObservableProperty] private string _theme = "System";
    [ObservableProperty] private string _accent = "Default";
    [ObservableProperty] private string _font = "Segoe UI Variable";

    public string[] SortModes { get; } = ["LastUsed", "Name"];
    public string[] Themes { get; } = ["System", "Light", "Dark", .. Theming.Palettes.Names()];
    public string[] AccentOptions { get; } = Theming.Accents.Names();
    public string[] FontOptions { get; } = Theming.AppFonts.All;

    /// <summary>Raised when a transient confirmation toast should be shown.</summary>
    public event Action<string>? ToastRequested;

    /// <summary>Raised when the user changes theme, accent or font; the window re-applies appearance.</summary>
    public event Action? AppearanceChangeRequested;

    public bool VsCodeAvailable { get; } = CommandLocator.FindOnPath("code") is not null;

    public MainViewModel(
        DispatcherQueue dispatcherQueue,
        IUserDialogs dialogs,
        ConfigService? configService = null,
        StateService? stateService = null,
        IClaudeSessionDetector? sessionDetector = null)
    {
        _dispatcherQueue = dispatcherQueue;
        _dialogs = dialogs;
        _configService = configService ?? new ConfigService();
        _stateService = stateService ?? new StateService();
        _sessionDetector = sessionDetector ?? new ClaudeSessionDetector();
        _gitInfoProvider = new GitInfoProvider();
        _claudeCli = new ClaudeCliService();

        _watcherDebounce = dispatcherQueue.CreateTimer();
        _watcherDebounce.Interval = TimeSpan.FromMilliseconds(1500);
        _watcherDebounce.IsRepeating = false;
        _watcherDebounce.Tick += (_, _) => Rescan();

        // Live-session indicator refresh: cheap mtime probes every 30 s.
        _runningRefreshTimer = dispatcherQueue.CreateTimer();
        _runningRefreshTimer.Interval = TimeSpan.FromSeconds(30);
        _runningRefreshTimer.IsRepeating = true;
        _runningRefreshTimer.Tick += (_, _) => RefreshRunningStates();
        _runningRefreshTimer.Start();

        // Flags persist debounced so typing doesn't rewrite config.json per keystroke.
        _flagsSaveDebounce = dispatcherQueue.CreateTimer();
        _flagsSaveDebounce.Interval = TimeSpan.FromMilliseconds(500);
        _flagsSaveDebounce.IsRepeating = false;
        _flagsSaveDebounce.Tick += (_, _) => FlushPendingFlagsSave();

        _config = _configService.Load();
        _state = _stateService.Load();
        Theme = _state.Theme;
        Accent = _state.Accent;
        Font = _state.Font;
        SortMode = _state.SortMode;
        ShowOnboarding = !_state.OnboardingDismissed;
        ClaudeMissing = !_claudeCli.IsOnPath;

        Rescan();
        _ = LoadClaudeVersionAsync();
    }

    // ---------- Scan / filter / sort ----------

    [RelayCommand]
    public void Rescan()
    {
        FlushPendingFlagsSave();
        _config = _configService.Load();
        _allProjects = ProjectScanner.Scan(_config);
        // RebuildSidebar re-selects an item, which would re-trigger ApplyFilter;
        // suppress so a rescan only filters (and starts enrichment) once.
        _suppressFilter = true;
        RebuildSidebar();
        _suppressFilter = false;
        ApplyFilter();
        RebuildWatchers();
        StatusText = $"{_allProjects.Count} projects across {(_config.Roots ?? []).Count(Directory.Exists)} roots";
        OnPropertyChanged(nameof(MoveTargetRoots));
    }

    private void RebuildSidebar()
    {
        var selectedRoot = SelectedSidebarItem?.Root;
        SidebarItems.Clear();
        SidebarItems.Add(new SidebarItemViewModel(
            $"All ({_allProjects.Count})", null, true,
            "Show projects from every source root"));
        foreach (var root in _config.Roots ?? [])
        {
            var exists = Directory.Exists(root);
            var count = _allProjects.Count(p => string.Equals(p.Root, root, StringComparison.OrdinalIgnoreCase));
            var leaf = Path.GetFileName(root.TrimEnd('\\', '/'));
            SidebarItems.Add(new SidebarItemViewModel(
                $"{leaf} ({count})", root, exists,
                exists ? root : $"{root} — folder not found on disk"));
        }
        SelectedSidebarItem =
            SidebarItems.FirstOrDefault(i => i.Root is not null &&
                string.Equals(i.Root, selectedRoot, StringComparison.OrdinalIgnoreCase))
            ?? SidebarItems[0];
    }

    private void ApplyFilter()
    {
        var selectedPath = SelectedProject?.Path;

        IEnumerable<ProjectInfo> filtered = _allProjects;
        var root = SelectedSidebarItem?.Root;
        if (root is not null)
            filtered = filtered.Where(p => string.Equals(p.Root, root, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(SearchText))
            filtered = filtered.Where(p => p.Name.Contains(SearchText.Trim(), StringComparison.OrdinalIgnoreCase));

        var pinned = new HashSet<string>(_state.Pinned, StringComparer.OrdinalIgnoreCase);
        IOrderedEnumerable<ProjectInfo> sorted = SortMode == "Name"
            ? filtered.OrderByDescending(p => pinned.Contains(p.Path))
                      .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            : filtered.OrderByDescending(p => pinned.Contains(p.Path))
                      .ThenByDescending(p => p.LastUsedUtc ?? DateTime.MinValue)
                      .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase);

        Projects.Clear();
        foreach (var info in sorted)
            Projects.Add(new ProjectItemViewModel(info, pinned.Contains(info.Path)));

        IsListEmpty = Projects.Count == 0;
        EmptyStateText = ComputeEmptyStateText();

        SelectedProject = Projects.FirstOrDefault(p =>
            string.Equals(p.Path, selectedPath, StringComparison.OrdinalIgnoreCase));

        StartEnrichment();
        RefreshRunningStates();
    }

    private string ComputeEmptyStateText()
    {
        if (!IsListEmpty) return "";
        if (!string.IsNullOrWhiteSpace(SearchText))
            return $"No projects match \"{SearchText.Trim()}\". Press Esc to clear the search.";
        if ((_config.Roots ?? []).Count == 0)
            return "No source roots configured yet. Open Settings to add the folders that contain your projects.";
        return "No projects found. Create one with “+ New Project”, or drop a folder onto this window.";
    }

    /// <summary>Two-phase load: rows render instantly, session/git info fills in async.</summary>
    private void StartEnrichment()
    {
        _enrichmentCts?.Cancel();
        _enrichmentCts?.Dispose();
        _enrichmentCts = new CancellationTokenSource();
        var ct = _enrichmentCts.Token;
        var rows = Projects.ToList();

        _ = Task.Run(async () =>
        {
            try
            {
                foreach (var row in rows)
                {
                    if (ct.IsCancellationRequested) return;
                    var hasSession = _sessionDetector.HasSession(row.Path);
                    var git = await _gitInfoProvider.GetAsync(row.Path, ct).ConfigureAwait(false);
                    _dispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () =>
                    {
                        // Re-check on the UI thread so a stale pass never
                        // writes to rows a newer filter already replaced.
                        if (ct.IsCancellationRequested) return;
                        row.HasSession = hasSession;
                        if (git is not null)
                        {
                            row.GitBranch = git.Branch;
                            row.GitDirty = git.IsDirty;
                        }
                    });
                }
            }
            catch (OperationCanceledException)
            {
                // Superseded by a newer scan/filter — expected.
            }
            catch (Exception)
            {
                // Enrichment is decoration; it must never take the app down.
            }
        }, ct);
    }

    private void UpdateRunningSummary()
    {
        var count = Projects.Count(p => p.IsRunning);
        RunningSummary = count switch
        {
            0 => "",
            1 => "· 1 live session",
            _ => $"· {count} live sessions",
        };
        AnySessionRunning = count > 0;
    }

    /// <summary>
    /// Refreshes the live-session indicators. One process scan per pass
    /// (claude/node cwd inspection), with a recent-transcript fallback so a
    /// blocked process scan degrades gracefully instead of going dark.
    /// </summary>
    private void RefreshRunningStates()
    {
        // Tied to the enrichment CTS: a Rescan/filter (or Shutdown) cancels
        // any in-flight pass so it never writes to replaced rows.
        var ct = _enrichmentCts?.Token ?? CancellationToken.None;
        var rows = Projects.ToList();
        if (rows.Count == 0) return;
        _ = Task.Run(() =>
        {
            if (ct.IsCancellationRequested) return;
            IReadOnlySet<string> runningDirs;
            try { runningDirs = _runningDetector.GetRunningClaudeDirectories(); }
            catch (Exception) { runningDirs = new HashSet<string>(); }

            var results = rows.Select(r =>
            {
                var processRunning = RunningClaudeDetector.IsProjectRunning(runningDirs, r.Path);
                var transcriptFresh = !processRunning &&
                    DateTime.UtcNow - _sessionDetector.GetLatestActivityUtc(r.Path) < TranscriptFallbackWindow;
                return (Row: r, IsRunning: processRunning || transcriptFresh);
            }).ToList();

            _dispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () =>
            {
                if (ct.IsCancellationRequested) return;
                foreach (var (row, isRunning) in results)
                    row.IsRunning = isRunning;
                UpdateRunningSummary();
            });
        });
    }

    partial void OnSearchTextChanged(string value) => ApplyFilter();

    partial void OnSelectedSidebarItemChanged(SidebarItemViewModel? value)
    {
        if (value is not null && !_suppressFilter) ApplyFilter();
    }

    partial void OnSortModeChanged(string value)
    {
        _state.SortMode = value;
        _stateService.Save(_state);
        ApplyFilter();
    }

    partial void OnThemeChanged(string value)
    {
        _state.Theme = value;
        _stateService.Save(_state);
        AppearanceChangeRequested?.Invoke();
    }

    partial void OnAccentChanged(string value)
    {
        _state.Accent = value;
        _stateService.Save(_state);
        AppearanceChangeRequested?.Invoke();
    }

    partial void OnFontChanged(string value)
    {
        _state.Font = value;
        _stateService.Save(_state);
        AppearanceChangeRequested?.Invoke();
    }

    // ---------- Flags ----------

    partial void OnSelectedProjectChanged(ProjectItemViewModel? value)
    {
        FlushPendingFlagsSave(); // persist the previous project's edits first
        _loadingFlags = true;
        if (value is not null)
        {
            FlagsEnabled = true;
            FlagsText = value.Flags;
        }
        else
        {
            FlagsText = "";
            FlagsEnabled = false;
        }
        _loadingFlags = false;
    }

    partial void OnFlagsTextChanged(string value)
    {
        if (_loadingFlags || SelectedProject is null) return;
        SelectedProject.Flags = value;
        _pendingFlagsSave = (SelectedProject.Path, value);
        _flagsSaveDebounce.Stop();
        _flagsSaveDebounce.Start();
    }

    private void FlushPendingFlagsSave()
    {
        _flagsSaveDebounce.Stop();
        if (_pendingFlagsSave is { } pending)
        {
            _pendingFlagsSave = null;
            _configService.UpdateFlags(_config, pending.Path, pending.Flags);
        }
    }

    [RelayCommand]
    private void InsertFlag(FlagPreset preset)
    {
        if (SelectedProject is null) return;
        var current = FlagsText.TrimEnd();
        FlagsText = string.IsNullOrEmpty(current) ? preset.InsertText : current + " " + preset.InsertText;
    }

    // ---------- Launching ----------

    [RelayCommand]
    private Task LaunchNewAsync(ProjectItemViewModel? project) => LaunchAsync(project, continueSession: false);

    [RelayCommand]
    private Task LaunchContinueAsync(ProjectItemViewModel? project) => LaunchAsync(project, continueSession: true);

    private async Task LaunchAsync(ProjectItemViewModel? project, bool continueSession)
    {
        if (project is null) return;
        await LaunchWithFlagsAsync(project, project.Flags, continueSession);
    }

    private async Task LaunchWithFlagsAsync(ProjectItemViewModel project, string launchFlags, bool continueSession)
    {
        FlushPendingFlagsSave();
        if (!LaunchCommandBuilder.AreFlagsSafe(launchFlags))
        {
            await _dialogs.ShowMessageAsync("Dev-Projects", LaunchCommandBuilder.UnsafeFlagMessage);
            return;
        }
        var spec = LaunchCommandBuilder.Build(project.Name, project.Path, launchFlags, continueSession);
        try
        {
            SessionLauncher.Launch(spec);
        }
        catch (Exception ex)
        {
            await _dialogs.ShowMessageAsync("Dev-Projects", $"Launch failed: {ex.Message}");
            return;
        }
        _configService.UpdateUsage(_config, project.Path, project.Flags);
        _allProjects = ProjectScanner.Scan(_config);
        ApplyFilter();
        SelectedProject = Projects.FirstOrDefault(p =>
            string.Equals(p.Path, project.Path, StringComparison.OrdinalIgnoreCase));
        ToastRequested?.Invoke(continueSession
            ? $"Continuing Claude session in “{project.Name}”"
            : $"Opened a new Claude session in “{project.Name}”");
    }

    public IReadOnlyList<SessionSummary> ListSessions(ProjectItemViewModel project) =>
        _sessionLister.ListSessions(project.Path);

    public async Task ResumeSessionAsync(ProjectItemViewModel project, string sessionId)
    {
        // sessionId is a uuid (hex + dashes) — safe under AreFlagsSafe.
        await LaunchWithFlagsAsync(project, $"--resume {sessionId}", continueSession: false);
    }

    /// <summary>One-off launch in a folder that is not a tracked project (drag-drop).</summary>
    public async Task LaunchInFolderAsync(string folderPath)
    {
        var name = Path.GetFileName(folderPath.TrimEnd('\\', '/'));
        var spec = LaunchCommandBuilder.Build(name, folderPath, flags: "", continueSession: false);
        try
        {
            SessionLauncher.Launch(spec);
            ToastRequested?.Invoke($"Opened a new Claude session in “{name}”");
        }
        catch (Exception ex)
        {
            await _dialogs.ShowMessageAsync("Dev-Projects", $"Launch failed: {ex.Message}");
        }
    }

    // ---------- Pins ----------

    [RelayCommand]
    private void TogglePin(ProjectItemViewModel? project)
    {
        if (project is null) return;
        var pinned = _state.Pinned;
        if (pinned.Contains(project.Path, StringComparer.OrdinalIgnoreCase))
            pinned.RemoveAll(p => string.Equals(p, project.Path, StringComparison.OrdinalIgnoreCase));
        else
            pinned.Add(project.Path);
        _stateService.Save(_state);
        var keep = project.Path;
        ApplyFilter();
        SelectedProject = Projects.FirstOrDefault(p =>
            string.Equals(p.Path, keep, StringComparison.OrdinalIgnoreCase));
    }

    // ---------- Stop session(s) ----------

    [RelayCommand]
    private async Task StopSessionAsync(ProjectItemViewModel? project)
    {
        if (project is null) return;
        var sessions = RunningClaudeDetector.SessionsForProject(_runningDetector.GetRunningSessions(), project.Path).ToList();
        if (sessions.Count == 0) return;
        if (!await _dialogs.ConfirmAsync("Stop session",
                $"Stop {sessions.Count} running Claude session(s) in {project.Name}? Unsaved work in those sessions is lost.",
                "Stop", "Cancel"))
            return;
        foreach (var s in sessions) SessionKiller.Kill(s.Pid);
        RefreshRunningStates();
    }

    [RelayCommand]
    private async Task StopAllAsync()
    {
        var sessions = _runningDetector.GetRunningSessions();
        if (sessions.Count == 0) return;
        if (!await _dialogs.ConfirmAsync("Stop all sessions",
                $"Stop all {sessions.Count} running Claude session(s)? Unsaved work is lost.",
                "Stop all", "Cancel"))
            return;
        foreach (var s in sessions) SessionKiller.Kill(s.Pid);
        RefreshRunningStates();
    }

    // ---------- Quick actions ----------

    [RelayCommand]
    private void OpenInExplorer(ProjectItemViewModel? project)
    {
        if (project is null) return;
        using var process = Process.Start(
            new ProcessStartInfo("explorer.exe", $"\"{project.Path}\"") { UseShellExecute = true });
    }

    [RelayCommand]
    private void OpenInVsCode(ProjectItemViewModel? project)
    {
        if (project is null || !VsCodeAvailable) return;
        var code = CommandLocator.FindOnPath("code");
        if (code is null) return;
        using var process = Process.Start(new ProcessStartInfo(code, ArgumentEscaper.Quote(project.Path))
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        });
    }

    [RelayCommand]
    private void CopyPath(ProjectItemViewModel? project)
    {
        if (project is null) return;
        var package = new DataPackage();
        package.SetText(project.Path);
        Clipboard.SetContent(package);
        ToastRequested?.Invoke("Path copied to clipboard");
    }

    // ---------- Rename / move ----------

    /// <summary>Roots a project can be moved to (existing on disk). Shown in the context-menu submenu.</summary>
    public IReadOnlyList<string> MoveTargetRoots =>
        (_config.Roots ?? []).Where(Directory.Exists).ToList();

    /// <summary>Renames the project folder and migrates config/pin entries. Returns the new path.</summary>
    public string RenameProject(ProjectItemViewModel project, string newName)
    {
        var oldPath = project.Path;
        var newPath = ProjectMover.Rename(oldPath, newName); // throws -> caller shows the error
        FinishRelocation(oldPath, newPath);
        ToastRequested?.Invoke($"Renamed to “{Path.GetFileName(newPath)}”");
        return newPath;
    }

    [RelayCommand]
    private async Task MoveSelectedToRootAsync(string? targetRoot)
    {
        var project = SelectedProject;
        if (project is null || targetRoot is null) return;
        if (string.Equals(project.Root.TrimEnd('\\', '/'), targetRoot.TrimEnd('\\', '/'),
                StringComparison.OrdinalIgnoreCase))
        {
            ToastRequested?.Invoke("Project is already in that root");
            return;
        }

        var confirmed = await _dialogs.ConfirmAsync(
            "Move project",
            $"Move “{project.Name}” to {targetRoot}?\n\n" +
            "Note: Claude session history is tied to the folder path, so the Continue " +
            "button will start fresh after the move (the old transcripts are not deleted).",
            confirmText: "Move");
        if (!confirmed) return;

        string newPath;
        try
        {
            newPath = ProjectMover.MoveToRoot(project.Path, targetRoot);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or DirectoryNotFoundException)
        {
            await _dialogs.ShowMessageAsync("Move project",
                $"Could not move the project: {ex.Message}\n\n" +
                "If a Claude session or another program has files open in this folder, close it and try again.");
            return;
        }
        FinishRelocation(project.Path, newPath);
        ToastRequested?.Invoke($"Moved “{project.Name}” to {Path.GetFileName(targetRoot.TrimEnd('\\', '/'))}");
    }

    /// <summary>
    /// Post-move bookkeeping: re-keys lastUsed/flags + pin and rescans. The
    /// folder is already moved on disk at this point, so failures here must
    /// not surface as if the move failed — warn and carry on.
    /// </summary>
    private void FinishRelocation(string oldPath, string newPath)
    {
        try
        {
            _configService.MigrateProjectPath(_config, oldPath, newPath);
            var pinIndex = _state.Pinned.FindIndex(p => string.Equals(p, oldPath, StringComparison.OrdinalIgnoreCase));
            if (pinIndex >= 0)
            {
                _state.Pinned[pinIndex] = newPath;
                _stateService.Save(_state);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _ = _dialogs.ShowMessageAsync("Dev-Projects",
                "The folder was moved, but its saved settings (flags/pin) could not be updated: "
                + ex.Message);
        }
        Rescan();
        SelectProjectByPath(newPath);
    }

    // ---------- New project / settings / config access ----------

    public LauncherConfig Config => _config;

    public string? PreferredNewProjectRoot =>
        SelectedSidebarItem?.Root ?? _config.DefaultRoot;

    public string CreateProject(string root, string name)
    {
        var path = ProjectNameValidator.CreateProjectFolder(root, name);
        Rescan();
        return path;
    }

    public void AddRoot(string root)
    {
        _config.Roots ??= [];
        if (_config.Roots.Contains(root, StringComparer.OrdinalIgnoreCase)) return;
        _config.Roots.Add(root);
        if (string.IsNullOrEmpty(_config.DefaultRoot)) _config.DefaultRoot = root;
        _configService.Save(_config);
        Rescan();
        ToastRequested?.Invoke($"Added source root {root}");
    }

    public void RemoveRoot(string root)
    {
        _config.Roots?.RemoveAll(r => string.Equals(r, root, StringComparison.OrdinalIgnoreCase));
        if (string.Equals(_config.DefaultRoot, root, StringComparison.OrdinalIgnoreCase))
            _config.DefaultRoot = _config.Roots?.FirstOrDefault() ?? "";
        _configService.Save(_config);
        Rescan();
    }

    public void SetDefaultRoot(string root)
    {
        _config.DefaultRoot = root;
        _configService.Save(_config);
    }

    public bool IsKnownRootChild(string folderPath)
    {
        var parent = Path.GetDirectoryName(folderPath.TrimEnd('\\', '/'));
        return parent is not null &&
               (_config.Roots ?? []).Any(r => string.Equals(
                   r.TrimEnd('\\', '/'), parent, StringComparison.OrdinalIgnoreCase));
    }

    public void SelectProjectByPath(string path)
    {
        SearchText = "";
        SelectedSidebarItem = SidebarItems.FirstOrDefault();
        SelectedProject = Projects.FirstOrDefault(p =>
            string.Equals(p.Path, path, StringComparison.OrdinalIgnoreCase));
    }

    // ---------- Onboarding ----------

    [RelayCommand]
    private void DismissOnboarding()
    {
        ShowOnboarding = false;
        _state.OnboardingDismissed = true;
        _stateService.Save(_state);
    }

    // ---------- Background helpers ----------

    private async Task LoadClaudeVersionAsync()
    {
        if (!_claudeCli.IsOnPath)
        {
            ClaudeVersionText = "claude: not found on PATH";
            return;
        }
        var version = await _claudeCli.GetVersionAsync().ConfigureAwait(true);
        ClaudeVersionText = version is null ? "claude: version unknown" : $"claude {version}";
        if (version is not null)
            _ = CheckForUpdateAsync(version);
    }

    private async Task CheckForUpdateAsync(string installedRaw)
    {
        var latest = await _claudeCli.GetLatestPublishedVersionAsync();
        if (latest is null || !ClaudeVersionInfo.IsOutdated(installedRaw, latest)) return;
        _dispatcherQueue.TryEnqueue(() =>
        {
            UpdateAvailable = true;
            UpdateNudgeText = $"claude {latest} available — run `claude update`";
        });
    }

    /// <summary>Watches each root for folder add/remove/rename and rescans (debounced).</summary>
    private void RebuildWatchers()
    {
        foreach (var watcher in _watchers) watcher.Dispose();
        _watchers.Clear();
        foreach (var root in _config.Roots ?? [])
        {
            if (!Directory.Exists(root)) continue;
            try
            {
                var watcher = new FileSystemWatcher(root)
                {
                    NotifyFilter = NotifyFilters.DirectoryName,
                    IncludeSubdirectories = false,
                    EnableRaisingEvents = true,
                };
                FileSystemEventHandler onChange = (_, _) => _dispatcherQueue.TryEnqueue(() =>
                {
                    _watcherDebounce.Stop();
                    _watcherDebounce.Start();
                });
                watcher.Created += onChange;
                watcher.Deleted += onChange;
                watcher.Renamed += (_, _) => _dispatcherQueue.TryEnqueue(() =>
                {
                    _watcherDebounce.Stop();
                    _watcherDebounce.Start();
                });
                _watchers.Add(watcher);
            }
            catch (Exception ex) when (ex is IOException or ArgumentException)
            {
                // Root vanished between Exists check and watcher creation — ignore.
            }
        }
    }

    public void Shutdown()
    {
        FlushPendingFlagsSave();
        _watcherDebounce.Stop();
        _runningRefreshTimer.Stop();
        _enrichmentCts?.Cancel();
        _enrichmentCts?.Dispose();
        _enrichmentCts = null;
        foreach (var watcher in _watchers) watcher.Dispose();
        _watchers.Clear();
    }
}
