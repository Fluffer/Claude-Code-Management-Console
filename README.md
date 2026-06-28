# Claude Code Management Console

A Windows launcher hub for [Claude Code](https://claude.com/claude-code). It scans your
source-root folders (e.g. `C:\Dev\Active`), lists every project, and opens Claude
sessions in Windows Terminal tabs — new (`claude`) or continued (`claude --continue`) —
with per-project flags. Built with Electron, React and TypeScript.

![Stack](https://img.shields.io/badge/Electron-32-blue) ![UI](https://img.shields.io/badge/React-18-61dafb) ![Lang](https://img.shields.io/badge/TypeScript-5-3178c6)

## Features

- **Fluent-style design** with a System/Light/Dark theme toggle
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
- **Auto-refresh** — a file watcher picks up folders created/removed outside the app
- **Drag & drop** a folder to add it as a source root or launch Claude in it one-off
- **First-run onboarding**, tooltips on every control, full F1 help guide
- Status bar shows the detected `claude` CLI version and the app version

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
- **Transcript browser & cost** — Resume session… surfaces the past transcript with token
  usage and an estimated per-project cost
- **MCP health check** — probe a project's configured MCP servers (spawn / http) on demand

### Niche & polish (Tier 3)

- **Sticky terminal title** — a launched session's terminal tab is titled with the project
  folder name and keeps it for the life of the session (`claude -n` owns the title)
- **Clean first-run config** — a fresh install ships with no source roots; the Settings
  dialog opens once to guide a new user to add their projects folder
- **Saved filters** — name a set of conditions (path-contains, has-git, has-CLAUDE.md,
  has-running-session, pinned) from the **Filters** button; each appears as a sidebar entry
- **MCP viewer** — projects with a `.mcp.json` show an MCP pill; right-click → View MCP
  servers… lists each server and its transport (read-only)
- **Slash commands & skills** — projects expose their `.claude/commands` and skills; launch
  with a command pre-filled or browse skills read-only
- **Duplicate a project** — right-click → Duplicate… clones a project (git clone or exact
  copy) into a new folder
- **Deep link** — `ccmc://launch?project=<name>[&new=true]` launches/continues a
  project (packaged build only; routes on a cold start)
- **Terminal auto-approver** — an optional daemon that auto-approves terminal prompts across
  Windows Terminal tabs (`tools/terminal-auto-approver`)
- **Session-ended toast** — a toast appears when a tracked Claude session exits
- **Close to tray** — a tray icon with a jump list; closing the window hides to tray

## Layout

```
electron/src/core      # logic: config, scanning, launch building, git/session probes
electron/src/main      # Electron main process: IPC, OS integration, tray/hotkey/protocol
electron/src/preload   # contextBridge preload
electron/src/renderer  # React UI (features, dialogs, components, hooks)
electron/tests         # vitest suite (core + renderer)
electron/resources     # app.ico (window + tray icon)
electron/build/appx    # AppX tile/logo assets (taskbar + Start), generated from app.ico
tools/                 # terminal-auto-approver daemon (shipped with the app)
docs/                  # design specs & implementation plans
```

## Build & run

```powershell
cd electron
npm install
npm run dev          # launch the app in development
npm run lint         # eslint
npm test             # vitest run
npm run build        # compile main/preload/renderer into out/
```

### Package a signed MSIX/AppX

```powershell
cd electron
$env:SIGNTOOL_PATH = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
npm run package      # electron-vite build && electron-builder --win appx
```

Output lands in `electron/dist\Claude Code Management Console <ver>.appx`, signed with a
public Certum code-signing cert (installs with no trust prompt). `SIGNTOOL_PATH` must point
at a modern Windows SDK signtool — electron-builder's bundled one fails on this cert. Bump
`electron/package.json` `version` before each release, or AppX refuses to install over the
same version. To regenerate the taskbar/Start tiles after changing `resources/app.ico`, run
`electron/scripts/gen-appx-assets.ps1`, then repackage.

## Data & compatibility

- `%APPDATA%\ccmc\config.json` — roots, default root, per-project lastUsed/flags.
  On first run the app migrates any existing legacy data; a corrupt file is quarantined to
  `config.json.bad` and regenerated.
- `%APPDATA%\ccmc\state.json` — UI state (theme, sort, pins, onboarding).
- Single instance: launching a second copy activates the existing window.

## Notes

- Session detection probes `%USERPROFILE%\.claude\projects\<encoded-path>` — an
  undocumented Claude Code internal. If the encoding ever changes, Continue simply
  reverts to always-enabled; nothing breaks.
- The flag catalog (`electron/src/core/config/flagCatalog.ts`) is curated by hand — re-check
  it against `claude --help` occasionally, as CLI flags drift between versions.
