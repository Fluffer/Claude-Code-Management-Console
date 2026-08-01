# Claude Code Management Console

A Windows launcher hub for [Claude Code](https://claude.com/claude-code). It scans your
source-root folders (e.g. `C:\Dev\Active`), lists every project, and opens Claude
sessions in Windows Terminal tabs — new (`claude`) or continued (`claude --continue`) —
with per-project flags. Built with Electron, React and TypeScript.

![Stack](https://img.shields.io/badge/Electron-43-blue) ![UI](https://img.shields.io/badge/React-18-61dafb) ![Lang](https://img.shields.io/badge/TypeScript-5-3178c6)

## Features

- **Fluent-style design**, themed to match Windows
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
- **Per-project flags** — saved per project and passed to both New and Continue; set them
  with the row's model picker or by applying a launch profile. F1 lists the common flags
  with plain-English descriptions
- **Git awareness** — branch name + dirty indicator per row (async, never blocks the UI)
- **Commit & open PR** — right-click → Commit… stages all + commits (optionally pushing);
  Open PR… commits if dirty, pushes, then runs `gh pr create` and offers the URL
- **Live-session badges** — green "live" pill on projects with a claude process actually
  running in their folder (detected by inspecting claude/node process working directories;
  where the working directory can't be read, falls back to the session name this app set at
  launch, so hand-started sessions may be missed), with a total count in the status bar
- **Rename, move, duplicate, hide & delete** — right-click → Rename… or Move to root (e.g.
  Archive/Stable), with saved flags, last-used and pin following the project automatically;
  Hide drops a folder from the list without touching disk; Delete offers recycle-bin or
  permanent and refuses while a session is running
- **Clone a repo** — ⤓ Clone repo… clones a URL straight into a source root
- **Open in VS Code** or in Explorer from the context menu
- **Pinned favourites**, sort by recent use or name
- **Auto-refresh** — file watchers pick up projects created or removed outside the app, and
  config/state edited by another instance
- **Drag & drop** a folder onto the window to add it as a source root
- **First-run onboarding**, tooltips on every control, full F1 help guide
- **Theming** — System/Light/Dark plus accent colour and UI font pickers, with live preview
- **Terminal detection** — Windows Terminal by default; installed alternatives are detected
  and selectable in Settings
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
- **Transcript browser & cost** — Resume session… surfaces the past transcript alongside an
  estimated per-project cost, derived from the token counts recorded in each transcript.
  Treat it as a rough figure: it is list-price arithmetic that cannot see your plan, so on a
  subscription (where marginal cost is flat) it does not represent money actually spent
- **MCP health check** — probe a project's configured MCP servers (spawn / http) on demand

### Niche & polish (Tier 3)

- **Sticky terminal title** — a launched session's terminal tab is titled with the project
  folder name and keeps it for the life of the session (`claude -n` owns the title)
- **Clean first-run config** — a fresh install ships with no source roots; a dismissible
  onboarding banner points a new user at Settings to add their projects folder
- **Saved filters** — name a set of conditions (path-contains, has-git, has-CLAUDE.md,
  has-running-session, pinned) from the **Filters** button; each appears as a sidebar entry
- **MCP viewer** — projects with a `.mcp.json` show an MCP pill; right-click → View MCP
  servers… lists each server and its transport (read-only)
- **Slash commands & skills** — projects expose their `.claude/commands` and skills; launch
  with a command pre-filled or browse skills read-only
- **Duplicate a project** — right-click → Duplicate… clones a project (git clone or exact
  copy) into a new folder
- **Deep link** — `ccmc://launch?project=<name>[&new=true]` launches/continues a
  project; routes on a cold start as well as into a running instance
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
- `%APPDATA%\ccmc\state.json` — UI state (theme, sort, pins, onboarding, profiles, groups,
  saved filters).
- Single instance: launching a second copy activates the existing window.
- The app never writes your real `.claude/settings.json`. Model, permission-mode and tool
  allowlists are stored as CCMC's own per-project flags and passed as CLI arguments, so
  nothing it does leaks into a plain terminal session. The one exception is the `.env`
  editor, which writes the project file you asked it to edit.

## Notes

- Session detection probes `%USERPROFILE%\.claude\projects\<encoded-path>` — an
  undocumented Claude Code internal. If the encoding ever changes, Continue simply
  reverts to always-enabled; nothing breaks.
- Every handler that writes, deletes, executes or hands a path to the shell first confines it
  to a configured source root (`requireConfinedPath` in `electron/src/main/ipc/handlers.ts`),
  so a malformed IPC request cannot reach outside your project folders.
- The flag catalog (`electron/src/core/config/flagCatalog.ts`) is reference material shown in
  the F1 help and is curated by hand — re-check it against `claude --help` occasionally, as
  CLI flags drift between versions.
- macOS support is stubbed, not implemented: the platform factories resolve to `*.mac.ts`
  placeholders that reject. Windows is the only working target today.
