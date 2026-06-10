# Claude Code Management Console

A Windows launcher hub for [Claude Code](https://claude.com/claude-code). It scans your
source-root folders (e.g. `C:\Dev\Active`), lists every project, and opens Claude
sessions in Windows Terminal tabs — new (`claude`) or continued (`claude --continue`) —
with per-project flags. Built with .NET 10 and WinUI 3 (Windows App SDK).

![Stack](https://img.shields.io/badge/.NET-10.0-blueviolet) ![UI](https://img.shields.io/badge/WinUI-3-blue)

## Features

- **Fluent design** with Mica backdrop and System/Light/Dark theme toggle
- **Keyboard-first**: `Enter` = Continue, `Ctrl+Enter` = New, `Ctrl+F` = search,
  `Ctrl+N` = new project, `Ctrl+P` = command palette, `Ctrl+Shift+Enter` = quick prompt,
  `F5` = refresh, `F1` = help
- **Command palette** (`Ctrl+P`) — fuzzy-jump to any project across all roots; `Enter`
  continues it, `Ctrl+Enter` starts a fresh session
- **Quick prompt** — right-click → Quick prompt… (or `Ctrl+Shift+Enter`) opens a new
  session seeded with a first message; the prompt is safely single-quoted for the shell
- **Resume a specific session** — right-click → Resume session… lists past sessions
  (first-message preview + relative time, newest first) and launches `claude --resume <id>`
- **Stop sessions** — right-click → Stop session, or **Stop all** in the bottom bar;
  both confirm first (killing a session loses unsaved work)
- **Per-row model picker** — choose Default / sonnet / opus / haiku per project; writes
  `--model` into that project's saved flags
- **Recent launches** — a Recent dropdown lists the last projects you launched (newest
  first, deduped, capped), persisted across restarts
- **CLAUDE.md badge** — projects with a `CLAUDE.md` show a pill; open it from the context menu
- **Update nudge** — the status bar flags when a newer `claude` CLI is published on npm
- **Smart Continue** — the Continue button greys out (with an explanatory tooltip)
  when no previous Claude session exists for that folder
- **Flags builder** — `＋ Flag` inserts common claude flags with plain-English descriptions
- **Git awareness** — branch name + dirty indicator per row (async, never blocks the UI)
- **Live-session badges** — green "live" pill on projects with a claude process actually
  running in their folder (detected by inspecting claude/node process working directories;
  recent-transcript fallback), with a total count in the status bar
- **Rename & move** — right-click → Rename… or Move to root (e.g. Archive/Stable);
  saved flags, last-used and pin follow the project automatically
- **Pinned favourites**, sort by recent use or name
- **Auto-refresh** — FileSystemWatcher picks up folders created/removed outside the app
- **Drag & drop** a folder to add it as a source root or launch Claude in it one-off
- **First-run onboarding**, tooltips on every control, full F1 help guide
- Status bar shows the detected `claude` CLI version

### Power-user (Tier 2)

- **Launch profiles** — save named flag bundles (model, permission-mode, allowed/disallowed
  tools) via **Profiles…**; right-click → Apply profile writes the composed flags into a
  project's saved flags. Generalizes the model picker; stays launcher-side (never edits your
  real `.claude/settings.json`)
- **Launch in a git worktree** — right-click → Launch in worktree… lists the repo's worktrees
  (`git worktree list`) and opens Claude in the chosen one
- **Stale-session pill** — a muted badge on projects with no session activity in over a week
  (and not currently running)
- **settings.json validation** — a caution pill flags a malformed `.claude/settings.json`
  (which Claude would silently ignore); open it from the context menu to fix
- **Project files** — right-click → Project files: edit `.env` keys (values masked by
  default) or open `.claudeignore` in your editor
- **Launch groups** — save a set of projects as a group and open the whole stack in one
  click from the **Groups** dropdown
- **Global summon hotkey** — `Ctrl+Alt+Space` brings the app forward and opens the command
  palette from anywhere (fail-soft if the combo is already taken)

### Niche & polish (Tier 3)

- **Sticky terminal title** — a launched session's terminal tab is titled with the project
  folder name and keeps it for the life of the session (`claude -n` owns the title)
- **Clean first-run config** — a fresh install ships with no source roots; the Settings
  dialog opens once to guide a new user to add their projects folder
- **Saved filters** — name a set of conditions (path-contains, has-git, has-CLAUDE.md,
  has-running-session, pinned) from the **Filters** button; each appears as a sidebar entry
- **MCP viewer** — projects with a `.mcp.json` show an MCP pill; right-click → View MCP
  servers… lists each server and its transport (read-only)
- **Deep link** — `ccmc://launch?project=<name>[&new=true]` launches/continues a
  project (packaged build only; routes on a cold start)
- **Session-ended toast** — a toast appears when a tracked Claude session exits
- **Config auto-snapshot** — every config save drops a timestamped copy in a `snapshots/`
  folder (keeps the 10 newest); restore is a manual file copy

## Layout

```
src/Ccmc.Core        # logic: config, scanning, launch building, git/session probes
src/Ccmc.WinUI       # WinUI 3 app: MVVM (CommunityToolkit), Mica, ContentDialogs
tests-net/…Core.Tests       # xUnit suite (ported from the original Pester suite)
legacy/                     # the original PowerShell + XamlReader implementation (v1)
docs/                       # design spec & implementation plans
```

## Build & run

```powershell
dotnet build Ccmc.sln -p:Platform=x64
dotnet test tests-net/Ccmc.Core.Tests
winapp run "src/Ccmc.WinUI/bin/x64/Debug/net10.0-windows10.0.26100.0/win-x64"
```

Publish an unpackaged self-contained build for the launcher shim:

```powershell
dotnet publish "src/Ccmc.WinUI" -c Release -r win-x64 -p:Platform=x64 -p:UnpackagedPublish=true -o publish
```

`launcher.cmd` starts `publish\ccmc.exe` when present (and falls back to the
legacy PowerShell launcher otherwise), so existing shortcuts keep working.

## Data & compatibility

- `%APPDATA%\ccmc\config.json` — roots, default root, per-project lastUsed/flags.
  **Schema-compatible with the v1 PowerShell launcher.** On first run the app copies
  any existing `%APPDATA%\Dev-Projects` data over (the legacy folder is left intact);
  a corrupt file is quarantined to `config.json.bad` and regenerated.
- `%APPDATA%\ccmc\state.json` — v2+-only UI state (theme, sort, pins, onboarding).
- Single instance: launching a second copy activates the existing window.

## Notes

- Session detection probes `%USERPROFILE%\.claude\projects\<encoded-path>` — an
  undocumented Claude Code internal. If the encoding ever changes, Continue simply
  reverts to always-enabled; nothing breaks.
- The flag catalog (`ClaudeFlagCatalog.cs`) is curated by hand — re-check it against
  `claude --help` occasionally, as CLI flags drift between versions.
