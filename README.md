# Dev-Projects

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

## Layout

```
src/DevProjects.Core        # logic: config, scanning, launch building, git/session probes
src/DevProjects.WinUI       # WinUI 3 app: MVVM (CommunityToolkit), Mica, ContentDialogs
tests-net/…Core.Tests       # xUnit suite (ported from the original Pester suite)
legacy/                     # the original PowerShell + XamlReader implementation (v1)
docs/                       # design spec & implementation plans
```

## Build & run

```powershell
dotnet build DevProjects.sln -p:Platform=x64
dotnet test tests-net/DevProjects.Core.Tests
winapp run "src/DevProjects.WinUI/bin/x64/Debug/net10.0-windows10.0.26100.0/win-x64"
```

Publish an unpackaged self-contained build for the launcher shim:

```powershell
dotnet publish "src/DevProjects.WinUI" -c Release -r win-x64 -p:Platform=x64 -p:UnpackagedPublish=true -o publish
```

`launcher.cmd` starts `publish\Dev-Projects.exe` when present (and falls back to the
legacy PowerShell launcher otherwise), so existing shortcuts keep working.

## Data & compatibility

- `%APPDATA%\Dev-Projects\config.json` — roots, default root, per-project lastUsed/flags.
  **Schema-compatible with the v1 PowerShell launcher** (both can read each other's file;
  a corrupt file is quarantined to `config.json.bad` and regenerated).
- `%APPDATA%\Dev-Projects\state.json` — v2+-only UI state (theme, sort, pins, onboarding).
- Single instance: launching a second copy activates the existing window.

## Notes

- Session detection probes `%USERPROFILE%\.claude\projects\<encoded-path>` — an
  undocumented Claude Code internal. If the encoding ever changes, Continue simply
  reverts to always-enabled; nothing breaks.
- The flag catalog (`ClaudeFlagCatalog.cs`) is curated by hand — re-check it against
  `claude --help` occasionally, as CLI flags drift between versions.
