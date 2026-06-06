namespace DevProjects.Core.Services;

/// <summary>A common claude CLI flag with a plain-English description for the flags builder.</summary>
public sealed record FlagPreset(string Display, string InsertText, string Description);

/// <summary>
/// Curated list of common claude CLI flags surfaced in the UI. Deliberately
/// short and conservative — review against `claude --help` when updating the
/// app, since CLI flags drift between versions.
/// </summary>
public static class ClaudeFlagCatalog
{
    public static readonly IReadOnlyList<FlagPreset> Presets =
    [
        new("--model sonnet", "--model sonnet",
            "Use Sonnet — fast and great for everyday coding tasks."),
        new("--model opus", "--model opus",
            "Use Opus — the most capable model, best for complex work."),
        new("--permission-mode plan", "--permission-mode plan",
            "Start in Plan Mode: Claude proposes a plan for approval before changing anything."),
        new("--permission-mode acceptEdits", "--permission-mode acceptEdits",
            "Auto-accept file edits; commands still ask for permission."),
        new("--resume", "--resume",
            "Pick a specific past session to resume from a list (instead of the most recent)."),
        new("--verbose", "--verbose",
            "Show detailed output for every step Claude takes."),
        new("--add-dir <path>", "--add-dir ",
            "Give Claude access to an additional folder outside the project."),
    ];
}
