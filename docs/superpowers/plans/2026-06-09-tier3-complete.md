# Tier 3 (Complete) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. One fresh subagent per task; two-stage review between tasks. Core
> tasks are TDD (red→green→commit) via `developer`; WinUI tasks are build+manual-smoke via
> `winui:winui-dev`, reviewed by `winui:winui-code-review` before commit.

**Goal:** Ship the full Tier 3 surface as one PR on `feat/tier3-title-config`: two
launcher-polish features (sticky terminal title, clean default config + first-run prompt) plus
the five roadmap "niche" features (saved filters, read-only `.mcp.json` viewer, `dev-projects://`
deep link, process-completion toast, and the droppable config auto-snapshot).

**Architecture:** Same as Tiers 1–2 — testable logic in `DevProjects.Core` (xUnit, TDD); WinUI
wires it into the existing MVVM surface with **no DI**. New Core services are static or newed-up
inline. Built on shipped Tier 1 + Tier 2 (`master` @ `5061657`).

**Tech Stack:** .NET 10, WinUI 3 / Windows App SDK, CommunityToolkit.Mvvm, System.Text.Json, xUnit.

**Build/test commands:**
```powershell
dotnet build DevProjects.sln -p:Platform=x64
dotnet test tests-net/DevProjects.Core.Tests
```

---

## Scope and sequencing

Seven features, one PR. Cheapest/most-independent first; the five niche features then follow
their own proven sequence.

| Order | Task | Feature | Layer |
|-------|------|---------|-------|
| 1 | Sticky terminal title | new | Core |
| 2 | Clean default config | new | Core |
| 3 | First-run setup prompt | new | WinUI |
| 4 | Saved-filter model + predicate | 3.1 | Core |
| 5 | Persist saved filters on AppState | 3.1 | Core |
| 6 | Saved filters in the sidebar | 3.1 | WinUI |
| 7 | MCP config reader | 3.2 | Core |
| 8 | MCP badge + read-only viewer | 3.2 | WinUI |
| 9 | Session-end detector | 3.4 | Core |
| 10 | Process-completion toast | 3.4 | WinUI |
| 11 | Deep link / URI scheme | 3.3 | Core+WinUI |
| 12 (optional) | Config auto-snapshot | 3.5 | Core |

**Tasks 4–12 are already specified in full** (failing test → impl → commit, with complete code)
in the companion plan `docs/superpowers/plans/2026-06-09-tier3-niche.md`, as its Tasks 1–9 in the
same order. Execute those tasks **verbatim** from that file — they are the authoritative source
for Features 3.1–3.5. This plan owns Tasks 1–3 (the two new features) in full below, plus the
cross-cutting notes that apply to all twelve.

**Cross-cutting (applies to every task):**
- UTF-8 without BOM for every `.cs`.
- Conventional Commits, one commit per green task. Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (the niche plan shows an older
  `(1M context)` trailer — use this one instead for consistency with the repo's recent history).
- `System.Text.Json` via `ConfigService.JsonOpts` for any new persisted shape; new `AppState`
  fields must default-populate so old `state.json` still loads (regression test required).
- Any new flag injected into a launch must pass `LaunchCommandBuilder.AreFlagsSafe`. The `-n`
  session name (Task 1) is the one exception: it is separately single-quoted and must NOT flow
  through `AreFlagsSafe`.

---

## Task 1: Sticky terminal title = folder name (Core) — new feature

### Background

`LaunchCommandBuilder.Build` already passes Windows Terminal `--title <projectName>` (see
`src/DevProjects.Core/Services/LaunchCommandBuilder.cs:57`). But `--title` only sets the *initial*
tab title; once `claude` starts it takes ownership of the terminal title and overwrites it, so the
folder name does not stick.

The `claude` CLI's `-n, --name <name>` flag sets "a display name for this session (session picker,
and terminal title)". Passing it makes `claude` itself hold the title — the behaviour the user
already relies on in their PowerShell `claude` wrapper. This change threads the project folder name
into the `claude` command as `-n '<name>'`.

**Escaping:** the `claude` command line is handed to PowerShell via `-Command`, so the name is
wrapped in PowerShell **single quotes** with every `'` doubled (`'` → `''`) — identical to how
`initialPrompt` is already escaped at `LaunchCommandBuilder.cs:32`. Inside single quotes PowerShell
treats `$ \` ( ) ; | & # < > { }` as literal, so an arbitrary Windows folder name is safe and does
**not** need `AreFlagsSafe`.

**Command order:** `claude -n '<name>' [--continue | '<prompt>'] [flags]`.

**Files:**
- Modify: `src/DevProjects.Core/Services/LaunchCommandBuilder.cs`
- Test: `tests-net/DevProjects.Core.Tests/LaunchCommandTests.cs` (extend `LaunchCommandBuilderTests`)

- [ ] **Step 1: Write the failing tests.** Append to `LaunchCommandBuilderTests` in
`tests-net/DevProjects.Core.Tests/LaunchCommandTests.cs`:

```csharp
    [Fact]
    public void BuildClaudeCommand_WithName_PrependsSingleQuotedName() =>
        Assert.Equal("claude -n 'Foo Bar' --continue",
            LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true, name: "Foo Bar"));

    [Fact]
    public void BuildClaudeCommand_NameWithApostrophe_DoublesIt() =>
        Assert.Equal("claude -n 'O''Brien'",
            LaunchCommandBuilder.BuildClaudeCommand("", continueSession: false, name: "O'Brien"));

    [Fact]
    public void BuildClaudeCommand_NameWithShellChars_StaysQuoted_AndFlagsUnaffected()
    {
        var cmd = LaunchCommandBuilder.BuildClaudeCommand(
            "--model opus", continueSession: false, name: "A & B (test)");
        Assert.Equal("claude -n 'A & B (test)' --model opus", cmd);
        Assert.True(LaunchCommandBuilder.AreFlagsSafe("--model opus"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void BuildClaudeCommand_EmptyName_OmitsNameArgument(string? name) =>
        Assert.Equal("claude --continue",
            LaunchCommandBuilder.BuildClaudeCommand("", continueSession: true, name: name));

    [Fact]
    public void BuildClaudeCommand_NameAndPrompt_NameComesFirst() =>
        Assert.Equal("claude -n 'Proj' 'do a thing' --model opus",
            LaunchCommandBuilder.BuildClaudeCommand(
                "--model opus", continueSession: false, initialPrompt: "do a thing", name: "Proj"));

    [Fact]
    public void Build_WithWindowsTerminal_ThreadsNameIntoClaude_AndKeepsWtTitle()
    {
        var spec = LaunchCommandBuilder.Build(
            "My Proj", @"C:\Dev\Active\My Proj", "--model opus",
            continueSession: false, shell: "pwsh", wtPath: @"C:\wt\wt.exe");

        // WT --title still set (no generic-title flash), and claude -n holds it after launch.
        Assert.Contains("--title \"My Proj\"", spec.Arguments);
        Assert.Contains("\"claude -n 'My Proj' --model opus\"", spec.Arguments);
    }
```

- [ ] **Step 2: Update the two existing `Build` tests** whose expected `claude` command now gains
a `-n` segment. In the same file, replace these two assertions:

In `Build_WithWindowsTerminal_BuildsWtNewTabInvocation`, change the expected `spec.Arguments` to:

```csharp
        Assert.Equal(
            "-w 0 new-tab --title \"My Proj\" -d \"C:\\Dev\\Active\\My Proj\" pwsh -NoExit -Command \"claude -n 'My Proj' --model opus\"",
            spec.Arguments);
```

In `Build_WithoutWindowsTerminal_FallsBackToShell`, change the expected `spec.Arguments` to:

```csharp
        Assert.Equal("-NoExit -Command \"claude -n 'Proj' --continue\"", spec.Arguments);
```

(`Build_FlagsWithQuotes_AreEscapedCorrectly` uses `Assert.Contains` on the flag substring only —
it still passes unchanged.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter LaunchCommandBuilderTests`
Expected: FAIL — `BuildClaudeCommand` has no `name` parameter; the two updated expectations differ
from current output.

- [ ] **Step 4: Implement.** Edit `src/DevProjects.Core/Services/LaunchCommandBuilder.cs`.

Change `BuildClaudeCommand` to accept a `name` and prepend the `-n` segment:

```csharp
    public static string BuildClaudeCommand(
        string flags, bool continueSession, string? initialPrompt = null, string? name = null)
    {
        ArgumentNullException.ThrowIfNull(flags);
        if (!AreFlagsSafe(flags))
            throw new ArgumentException(UnsafeFlagMessage, nameof(flags));
        var command = "claude";
        // -n sets the claude session display name AND the terminal title, which claude
        // holds for the life of the session (WT --title alone is overwritten at launch).
        // Single-quoted for PowerShell -Command; every ' doubled. Not run through
        // AreFlagsSafe — single quoting makes an arbitrary folder name safe.
        if (!string.IsNullOrWhiteSpace(name))
            command += " -n '" + name.Replace("'", "''") + "'";
        if (continueSession) command += " --continue";
        else if (!string.IsNullOrWhiteSpace(initialPrompt))
            command += " '" + initialPrompt.Replace("'", "''") + "'";
        if (!string.IsNullOrWhiteSpace(flags)) command += " " + flags.Trim();
        return command;
    }
```

Thread `projectName` into the call inside `Build` (currently line 51):

```csharp
        var claudeCommand = BuildClaudeCommand(flags, continueSession, initialPrompt, projectName);
```

(Leave the existing WT `--title projectName` argument at line 57 unchanged — it removes the
generic-title flash before `claude` starts.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter LaunchCommandBuilderTests`
Expected: PASS (new tests + the two updated ones).

- [ ] **Step 6: Commit**

```bash
git add src/DevProjects.Core/Services/LaunchCommandBuilder.cs tests-net/DevProjects.Core.Tests/LaunchCommandTests.cs
git commit -m "feat(core): hold terminal title via claude -n session name"
```

---

## Task 2: Clean default config (Core) — new feature

### Background

`LauncherConfig.CreateDefault()` hardcodes the original developer's personal source roots
(`src/DevProjects.Core/Models/LauncherConfig.cs:17`). No `config.json` ships with the repo — it is
generated at runtime under `%APPDATA%\Dev-Projects\config.json` — so this source default is the
only place personal paths leak to a fresh install. This task makes the default empty. `ConfigService`
already tolerates empty/null roots everywhere (`_config.Roots ?? []`), and `Normalize` backfills a
missing `roots` key from `CreateDefault()`, so emptying the default cleanly empties backfilled
configs too.

The first-run *prompt* (opening Settings when roots are empty) is Task 3 — it reuses the existing
`AppState.OnboardingDismissed` flag and needs no new config field.

**Files:**
- Modify: `src/DevProjects.Core/Models/LauncherConfig.cs`
- Test: `tests-net/DevProjects.Core.Tests/ConfigServiceTests.cs` (update existing + add one)

- [ ] **Step 1: Update the failing/over-specified tests.** In
`tests-net/DevProjects.Core.Tests/ConfigServiceTests.cs`, make these four edits so they assert the
new empty default:

In `Load_CreatesDefaults_WhenFileMissing`, replace lines 20–21:

```csharp
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots);
        Assert.Null(config.DefaultRoot);
```

In `Load_QuarantinesCorruptFile_AndRegeneratesDefaults`, replace line 54:

```csharp
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots!);
```

In `Load_BackfillsMissingProperties`, replace lines 88–89:

```csharp
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots);
```

In `Load_ReturnsDefaultsWithoutOverwriting_WhenFileLocked`, replace line 115:

```csharp
            Assert.Null(fallback.DefaultRoot); // in-memory defaults (now empty)
```

Then add a new explicit test for the clean default:

```csharp
    [Fact]
    public void CreateDefault_IsEmpty_NoPersonalPaths()
    {
        var config = LauncherConfig.CreateDefault();
        Assert.NotNull(config.Roots);
        Assert.Empty(config.Roots);
        Assert.Null(config.DefaultRoot);
        Assert.NotNull(config.Ignore);
        Assert.Empty(config.Ignore);
        Assert.NotNull(config.Projects);
        Assert.Empty(config.Projects);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ConfigServiceTests`
Expected: FAIL — `CreateDefault()` still returns the hardcoded `C:\Dev\*` roots.

- [ ] **Step 3: Implement.** Edit `src/DevProjects.Core/Models/LauncherConfig.cs`, replacing the
`CreateDefault` body (lines 15–25):

```csharp
    public static LauncherConfig CreateDefault() => new()
    {
        // A fresh install ships no personal source roots. The first-run prompt
        // (reusing AppState.OnboardingDismissed) guides a new user to add their own.
        Roots = [],
        DefaultRoot = null,
        Ignore = [],
        Projects = new Dictionary<string, ProjectUsage>(StringComparer.OrdinalIgnoreCase),
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test tests-net/DevProjects.Core.Tests --filter ConfigServiceTests`
Expected: PASS.

- [ ] **Step 5: Run the full Core suite** to confirm no other test depended on the personal default.

Run: `dotnet test tests-net/DevProjects.Core.Tests`
Expected: PASS. (If any scanner/move test seeded roots from `CreateDefault`, fix it to set roots
explicitly — none is expected to, since they use temp dirs.)

- [ ] **Step 6: Commit**

```bash
git add src/DevProjects.Core/Models/LauncherConfig.cs tests-net/DevProjects.Core.Tests/ConfigServiceTests.cs
git commit -m "feat(core): ship empty default config (no personal roots)"
```

---

## Task 3: First-run setup prompt (WinUI) — new feature

### Background

With Task 2's empty default, a brand-new user opens an empty window. Guide them once: when roots
are empty **and** onboarding has not been dismissed, auto-open the existing `SettingsDialog` (the
same dialog the Settings button shows) so they add a root, then mark onboarding dismissed.

**Reuse the existing `AppState.OnboardingDismissed` flag** — do not add a new flag. The existing
welcome `InfoBar` (`MainWindow.xaml:33`, gated on `ShowOnboarding = !OnboardingDismissed`) and the
existing `DismissOnboardingCommand` (`MainViewModel.cs:899`, which sets `ShowOnboarding = false`,
`OnboardingDismissed = true`, and saves state) are reused as-is. The empty-state guidance text
(`ComputeEmptyStateText`, shown whenever roots are empty) remains the passive fallback on every
later launch.

Decision basis: one flag, one concept. An existing user already has roots, so the prompt's
precondition (roots empty) is false for them — they are never auto-prompted. A user who later
removes all roots is not re-nagged because onboarding is already dismissed; the empty-state text
covers them.

**Files:**
- Modify: `src/DevProjects.WinUI/ViewModels/MainViewModel.cs` (expose `NeedsFirstRunSetup`)
- Modify: `src/DevProjects.WinUI/MainWindow.xaml.cs` (fire the prompt once on load)

This is WinUI wiring (no Core unit test — the project has no UI test harness); verified by manual
smoke per project convention.

- [ ] **Step 1: Expose the precondition on the ViewModel.** In
`src/DevProjects.WinUI/ViewModels/MainViewModel.cs`, add a computed property near the other
onboarding members (around the `DismissOnboarding` command, line ~897):

```csharp
    /// <summary>
    /// True on a genuinely fresh install: no source roots configured and onboarding never
    /// dismissed. Drives the one-time first-run Settings prompt (see MainWindow).
    /// </summary>
    public bool NeedsFirstRunSetup =>
        (_config.Roots is null || _config.Roots.Count == 0) && !_state.OnboardingDismissed;
```

- [ ] **Step 2: Fire the prompt once after the window is ready.** In
`src/DevProjects.WinUI/MainWindow.xaml.cs`, the `SettingsDialog` show helper already exists
(`ShowSettingsDialogAsync`, line 614) and `DismissOnboardingCommand` already persists the flag.
`XamlRoot` is only valid once the visual tree has loaded, so hook `RootGrid.Loaded`. Add to the
constructor (after `RegisterGlobalHotkey();`, around line 57):

```csharp
        RootGrid.Loaded += FirstRunSetup_OnLoaded;
```

Then add the handler near the other dialog launchers (e.g. after `ShowSettingsDialogAsync`,
around line 623):

```csharp
    // ---------- First-run setup prompt ----------

    private async void FirstRunSetup_OnLoaded(object sender, RoutedEventArgs e)
    {
        // One-shot: detach immediately so a later layout pass can't re-open the dialog.
        RootGrid.Loaded -= FirstRunSetup_OnLoaded;

        // Guard: an async-void event handler must never let an exception reach the
        // message pump. Opening the first-run dialog is a convenience, not critical path.
        try
        {
            if (!ViewModel.NeedsFirstRunSetup) return;

            await ShowSettingsDialogAsync();              // user adds a root (or cancels)
            ViewModel.DismissOnboardingCommand.Execute(null); // mark onboarded + save, once
        }
        catch (Exception)
        {
            // Best-effort first-run guidance; swallow so startup can't crash.
        }
    }
```

> **Note:** `ShowSettingsDialogAsync` already calls `ViewModel.RescanCommand.Execute(null)` after
> the dialog closes, so a root the user adds is picked up immediately. No extra rescan needed.

- [ ] **Step 3: Build + manual smoke**

```powershell
dotnet build DevProjects.sln -p:Platform=x64
```

Then run the app against a **fresh** state. Easiest: temporarily rename
`%APPDATA%\Dev-Projects\config.json` and `state.json` aside, launch, confirm:
1. On first launch with no roots → the Settings dialog opens automatically; add a root → projects
   appear; the welcome InfoBar does not also pop (onboarding is now dismissed).
2. Close and relaunch → the dialog does **not** reopen (onboarding dismissed), and the added root
   persists.
3. Restore the renamed files afterward so the developer's real config returns.
4. Sanity: with the developer's real (populated) config, the dialog never auto-opens.

- [ ] **Step 4: Review then commit**

`winui:winui-code-review` (flag: confirm the `Loaded` handler is detached after first fire and the
async-void is guarded), then:

```bash
git add src/DevProjects.WinUI/ViewModels/MainViewModel.cs src/DevProjects.WinUI/MainWindow.xaml.cs
git commit -m "feat(ui): first-run setup prompt when no roots configured"
```

---

## Tasks 4–12 — roadmap niche features (execute from the companion plan)

Open `docs/superpowers/plans/2026-06-09-tier3-niche.md` and execute its **Tasks 1–9 verbatim**, in
order. They map to this plan's Tasks 4–12:

| This plan | Niche plan | Feature | Notes |
|-----------|-----------|---------|-------|
| 4 | Task 1 | 3.1 Saved-filter model + predicate (Core) | TDD, complete code in niche plan. |
| 5 | Task 2 | 3.1 Persist saved filters on AppState (Core) | Adds `AppState.SavedFilters` with back-compat regression test. |
| 6 | Task 3 | 3.1 Saved filters in the sidebar (WinUI) | New `SavedFilterDialog`; guard enrichment→ApplyFilter re-entry. |
| 7 | Task 4 | 3.2 MCP config reader (Core) | Defensive `.mcp.json` parse, never throws. |
| 8 | Task 5 | 3.2 MCP badge + read-only viewer (WinUI) | New `McpViewerDialog`. |
| 9 | Task 6 | 3.4 Session-end detector (Core) | Pure set-diff. |
| 10 | Task 7 | 3.4 Process-completion toast (WinUI) | Seed first pass without toasting. |
| 11 | Task 8 | 3.3 Deep link / URI scheme (Core+WinUI) | **Packaged build only**; parser is Core-tested. |
| 12 | Task 9 | 3.5 Config auto-snapshot (Core) | **OPTIONAL / droppable** — skip with no downstream impact. |

Apply this plan's cross-cutting commit-trailer note (`Co-Authored-By: Claude Opus 4.8
<noreply@anthropic.com>`) to those commits, overriding the older trailer shown in the niche plan.

---

## Tier 3 exit gate

- [ ] `dotnet build DevProjects.sln -p:Platform=x64` — clean (no new warnings beyond the
      pre-existing 27 `MVVMTK0045`).
- [ ] `dotnet test tests-net/DevProjects.Core.Tests` — all green: Tiers 1–2, the updated
      `LaunchCommandBuilderTests` + `ConfigServiceTests`, plus `ProjectFilterTests`,
      the `StateServiceTests` saved-filter additions, `McpConfigReaderTests`,
      `SessionEndDetectorTests`, `DeepLinkParserTests`, and (if built) `ConfigSnapshotTests`.
- [ ] Manual smoke of every new surface: sticky title on a launched tab; first-run prompt on a
      fresh config; saved filters; MCP badge/viewer; completion toast; deep link (packaged);
      auto-snapshot (if built).
- [ ] Update `README.md` Features list with the Tier-3 capabilities (sticky title; clean
      first-run config; saved filters; MCP viewer; deep link — note packaged-only; completion
      toast; auto-snapshot if shipped, omit if dropped).
- [ ] `git commit -m "docs: document Tier 3 enhancements in README"`.

---

## Self-review notes (carried for the implementer)

- **New/changed signatures:** `BuildClaudeCommand(string flags, bool continueSession, string?
  initialPrompt = null, string? name = null)` — `name` is the trailing optional arg, so every
  existing call site still compiles; only `Build` passes it. `MainViewModel.NeedsFirstRunSetup`
  (computed bool). No other public API changes in Tasks 1–3.
- **Security:** the `-n` name is single-quoted with `'`→`''` doubling, the exact pattern already
  proven for `initialPrompt` (injection-probe tests exist). It deliberately bypasses
  `AreFlagsSafe`, which still governs only the user-flags string.
- **Back-compat (Task 2):** emptying `CreateDefault()` changes backfilled and regenerated configs
  to empty roots; four existing `ConfigServiceTests` assertions are updated to match, plus one new
  explicit `CreateDefault_IsEmpty` test. Existing users with populated `config.json` are
  unaffected (`Normalize` only backfills null fields).
- **Onboarding (Task 3):** reuses `AppState.OnboardingDismissed` + `DismissOnboardingCommand` — no
  new state field, no new config-schema change. The `Loaded` handler is one-shot (detaches itself)
  and async-void-guarded.
- **Droppable:** niche Task 9 / this plan's Task 12 (3.5) is optional — skip with no downstream
  impact; if dropped, omit it from the README and exit gate.
