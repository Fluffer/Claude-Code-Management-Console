# Dev-Projects Enhancements — Master Roadmap

> **Status:** Approved direction (4-model council: deepseek-pro, glm, qwen-coder, minimax-m3).
> **Date:** 2026-06-09
> **Scope:** 21 capability enhancements, grouped into 3 build tiers.
> This roadmap is the *program*. Each tier becomes its own detailed TDD plan
> (`2026-06-09-tierN-*.md`) written and executed in sequence, because later tiers
> build on foundations laid by earlier ones (touching `LaunchSpec`, `AppState`,
> the running-session model). Detailing Tier 2/3 before Tier 1 exists would bake
> in type-mismatches.

---

## Guiding principle (council consensus)

**Lean on Claude Code's own config + filesystem artifacts; never parse transcript
JSON bodies.** Durable to read: `.claude/settings.json`, `.mcp.json`, `.env`,
session *filenames* and *file timestamps*, and the *first line* of a `.jsonl`
(stable enough for a topic preview). Rots on CLI update: token/cost accounting,
full transcript rendering, anything depending on message-object schema.

Stay a **lightweight launcher, not an IDE.** Detection/launch/config surfacing
is in scope; editing buffers, scaffolding, and taxonomy are not.

---

## Architecture facts the plans rely on

- Two assemblies: `DevProjects.Core` (testable, xUnit in `tests-net/`) and
  `DevProjects.App` (WinUI 3, MVVM CommunityToolkit, **manual** smoke test — the
  project has no UI test harness, matching the original design).
- **No DI container.** `MainViewModel` is constructed in `MainWindow.xaml.cs`
  with `DispatcherQueue` + `IUserDialogs`; it internally news-up the Core services
  (`ConfigService`, `StateService`, `IClaudeSessionDetector`, `GitInfoProvider`,
  `ClaudeCliService`, `RunningClaudeDetector`).
- Launch chain: `MainViewModel.LaunchAsync` → `LaunchCommandBuilder.Build` (static)
  → `SessionLauncher.Launch(LaunchSpec)` (static, `Process.Start` shell-execute).
- `LaunchSpec(FilePath, Arguments, WorkingDirectory)` — immutable record.
- Persisted UI state = `AppState` (`state.json`); per-project usage/flags =
  `LauncherConfig.Projects[path]` (`config.json`, v1-compatible). New persisted
  fields go on `AppState` unless they must be v1-shared.
- Session detection encodes a path with `[^A-Za-z0-9] → '-'`
  (`C:\Dev\Active\Claude Cli Management` → `C--Dev-Active-Claude-Cli-Management`)
  and looks in `%USERPROFILE%\.claude\projects\<encoded>\*.jsonl`.
- Live detection: `RunningClaudeDetector` scans `claude`/`node`/`bun` processes and
  reads each one's working directory via `ProcessInspector` (PEB walk, x64-only).
- Dialog pattern: subclass `ContentDialog`, ctor takes `MainViewModel` (+ data),
  set `XamlRoot`/`RequestedTheme` in code-behind, show via `DialogGate.ShowAsync`.
- Row template binds `x:Bind` to `ProjectItemViewModel` properties
  (`Name`, `IsPinned`, `IsRunning`, `HasGitInfo`, `GitBranch`, `HasSession`, …).

---

## Tier 1 — Foundations & highest-leverage UX (detailed plan: `2026-06-09-tier1-foundations.md`)

Built first; several items are prerequisites for Tier 2/3.

| # | Feature | Core/UI | Why first |
|---|---------|---------|-----------|
| 1.1 | **CLI version check + update nudge + readiness probe** | Core+UI | Folds in the "doctor" subset (version / PATH / auth / `.claude` writable). Unanimous pick. |
| 1.2 | **Running-session PID model** (replaces fragile env-tagging) | Core | Foundation: lets stop-all target real PIDs; keeps badges accurate. |
| 1.3 | **Stop / Stop-all running sessions** | Core+UI | Built on 1.2. |
| 1.4 | **`--resume` specific-session picker** | Core+UI | Reads session *filenames* + mtime + first line only (durable). Completes "smart Continue". |
| 1.5 | **One-shot prompt launch (`claude -p "…"`)** | Core+UI | Quick "ask about this repo" without a full session. |
| 1.6 | **Per-row model picker dropdown** | UI | The one flag everyone wants one-click; writes `--model X` into existing flags pipeline. |
| 1.7 | **CLAUDE.md presence badge + open-in-default-editor** | Core+UI | Strongest "Claude-ready" row signal; open ≠ inline edit. |
| 1.8 | **MRU "open recent" across all projects** | Core+UI | Trivial, large QoL; `AppState.RecentLaunches`. |
| 1.9 | **Command palette / fuzzy launcher (Ctrl+P)** | Core+UI | Single highest-UX win past ~30 projects. Fuzzy matcher is Core-testable. |

**Sequencing inside Tier 1:** 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9.
1.2 before 1.3 (PID model first). Others are independent but ordered cheapest-first.

---

## Tier 2 — Power-user capabilities (detailed plan: `2026-06-09-tier2-power.md`, written after Tier 1 lands)

| # | Feature | Core/UI | Notes / dependencies |
|---|---------|---------|----------------------|
| 2.1 | **Per-project launch profiles** | Core+UI | Backed by `.claude/settings.json` (model, permissionMode, allowedTools, disallowedTools). Generalizes 1.6. Read+write the real file Claude reads — no parallel state. |
| 2.2 | **Git worktree awareness + launch in worktree** | Core+UI | Extends `GitInfoProvider`; enumerate `git worktree list --porcelain`; launch into a chosen worktree path. |
| 2.3 | **Stale-session detection badge** | Core+UI | Sessions older than N days, no continue → "stale" pill. Reuses 1.4's session lister (mtime only). |
| 2.4 | **`.claude/settings.json` validation on load** | Core+UI | If hand-edited & broken: inline error + "open in editor". Prevents silent ignore. Pairs with 2.1. |
| 2.5 | **Per-project env vars / `.claudeignore` management** | Core+UI | Surface/edit `.env` keys and `.claudeignore` lines. Launcher is the natural home; zero IDE creep. |
| 2.6 | **Multi-project launch groups** | Core+UI | "Open this stack" → N tabs; saved group in `AppState.Groups`; optional ordering. Real launcher differentiator. |
| 2.7 | **Global summon-to-fuzzy-launch hotkey** | UI | Scoped to ONE hotkey (e.g. Ctrl+Alt+Space) that opens the 1.9 palette. Depends on 1.9. |

**Sequencing:** 2.1 → 2.4 (validation guards the file 2.1 writes) → 2.2 → 2.3 → 2.5 → 2.6 → 2.7.

---

## Tier 3 — Niche / conditional (detailed plan: `2026-06-09-tier3-niche.md`, written after Tier 2)

| # | Feature | Core/UI | Notes |
|---|---------|---------|-------|
| 3.1 | **Saved filters** (replaces "tags/groups") | Core+UI | path-contains, has-git, has-CLAUDE.md, has-running-session, pinned. Cheaper than taxonomy; defers "where does it go". |
| 3.2 | **MCP `.mcp.json` viewer (read-only first)** | Core+UI | Split-opinion item: ship read-only, add edit only on demand. |
| 3.3 | **Deep link / URI scheme** `dev-projects://launch?project=X` | UI | Register URI activation in `Package.appxmanifest`; route to `LaunchAsync`. |
| 3.4 | **Process-completion toast** | Core+UI | Watch tracked PIDs (1.2) for exit → toast. |
| 3.5 | **Export / import project list (JSON)** | Core+UI | DEMOTED by minimax. Implement as *auto-snapshot* of config next to it, not a manual round-trip that tempts schema breakage. Lowest priority; may be dropped. |

---

## Explicitly rejected (anti-list — do NOT build)

- **Token / cost dashboard** — depends on undocumented transcript schema; rots.
  (A read-only line-count stat *may* be reconsidered after the `.jsonl` shape
  proves stable across two CLI releases — not before.)
- **Full transcript browser** — same fragility; 1.4's filename+first-line picker
  covers the durable 80%.
- **Inline CLAUDE.md editor** — IDE creep; use 1.7's open-in-editor instead.
- **Generic project templates / scaffolding** — moves toward IDE.
- **Standalone doctor/health panel** — collapsed into 1.1.
- **Separate activity feed** — covered by live badges + 1.8 MRU.
- **Fine-grained status badges** (repo size, uncommitted count) — IDE filler.
- **Tags/groups taxonomy** — replaced by 3.1 saved filters.

---

## Subagent execution strategy

Per the user's request, each tier is executed with **subagent-driven development**
(`superpowers:subagent-driven-development`): one fresh subagent per task, two-stage
review between tasks. Agent-type routing:

| Work shape | Subagent type | Why |
|------------|---------------|-----|
| `DevProjects.Core` service + xUnit tests (1.1 parse, 1.2, 1.4, 1.5, 1.9 matcher, most of Tier 2/3 logic) | `developer` | TDD discipline, runs `dotnet test`. |
| WinUI XAML / ViewModel / dialog wiring (1.3 UI, 1.6, 1.7 UI, 1.8 UI, 1.9 palette dialog, hotkey) | `winui:winui-dev` | Knows WinAppSDK build/run, x:Bind, ContentDialog pattern. |
| Cross-cutting review before merge | `quality-reviewer` / `winui:winui-code-review` | Catches MVVM/theming/security issues compiler won't. |

Each Core task is fully TDD (red → green → commit). Each WinUI task is
build-and-manual-smoke (the project convention — no UI unit harness), reviewed by
`winui:winui-code-review` before commit.

**Verification gate per tier:** `dotnet build DevProjects.sln -p:Platform=x64` +
`dotnet test tests-net/DevProjects.Core.Tests` must be green, plus a manual smoke
of the new UI surface, before starting the next tier.

---

## Cross-cutting conventions for every task

- xUnit, `[Fact]`/`[Theory]`, temp dirs via `Directory.CreateTempSubdirectory` +
  `IDisposable.Dispose` cleanup (see `MiscServiceTests.cs`).
- `System.Text.Json` via the shared `ConfigService.JsonOpts` (camelCase, indented,
  case-insensitive) for any new persisted shape. New `AppState` fields must
  default-populate so old `state.json` still loads (regression test required —
  pattern: `OldStateJson_WithoutNewFields_LoadsDefaults`).
- Conventional Commits; one commit per green task.
- Any new flag injected into a launch must pass `LaunchCommandBuilder.AreFlagsSafe`.
- New Core services are newed-up in `MainViewModel`'s constructor (no DI).
