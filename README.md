# Dev-Projects

A Windows launcher hub for [Claude Code](https://claude.com/claude-code). It scans your
source-root folders (e.g. `C:\Dev\Active`), lists every project, and opens Claude
sessions in Windows Terminal tabs — new (`claude`) or continued (`claude --continue`) —
with per-project flags. Built with .NET 9 WPF and the Fluent theme (light/dark/system).

![Stack](https://img.shields.io/badge/.NET-9.0-blueviolet) ![UI](https://img.shields.io/badge/WPF-Fluent-blue)

## Features

- **Fluent design** with System/Light/Dark theme toggle
- **Keyboard-first**: `Enter` = Continue, `Ctrl+Enter` = New, `Ctrl+F` = search,
  `Ctrl+N` = new project, `F5` = refresh, `F1` = help
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
src/DevProjects.App         # WPF app: MVVM (CommunityToolkit), Fluent theme
tests-net/…Core.Tests       # xUnit suite (ported from the original Pester suite)
legacy/                     # the original PowerShell + XamlReader implementation (v1)
docs/                       # design spec & implementation plan
```

## Build & run

```powershell
dotnet build DevProjects.sln
dotnet test tests-net/DevProjects.Core.Tests
dotnet run --project src/DevProjects.App
```

Publish a single-file exe (framework-dependent, ~0.4 MB, <1s cold start):

```powershell
dotnet publish src/DevProjects.App -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o publish
```

`launcher.cmd` starts `publish\Dev-Projects.exe` when present (and falls back to the
legacy PowerShell launcher otherwise), so existing shortcuts keep working.

## Data & compatibility

- `%APPDATA%\Dev-Projects\config.json` — roots, default root, per-project lastUsed/flags.
  **Schema-compatible with the v1 PowerShell launcher** (both can read each other's file;
  a corrupt file is quarantined to `config.json.bad` and regenerated).
- `%APPDATA%\Dev-Projects\state.json` — v2-only UI state (theme, sort, pins, onboarding).
- Single instance: launching a second copy activates the existing window.

## Notes

- Session detection probes `%USERPROFILE%\.claude\projects\<encoded-path>` — an
  undocumented Claude Code internal. If the encoding ever changes, Continue simply
  reverts to always-enabled; nothing breaks.
- The flag catalog (`ClaudeFlagCatalog.cs`) is curated by hand — re-check it against
  `claude --help` occasionally, as CLI flags drift between versions.
