# Dev-Projects — Claude Code Project Launcher Hub

**Date:** 2026-06-06
**Status:** Approved design

## Purpose

A Windows GUI launcher hub for Claude Code. Shows all projects across multiple
configurable source root folders, lets the user launch Claude sessions in them
(new or continued), and create new project folders. The hub stays open so
multiple sessions can be launched into separate Windows Terminal tabs.

## Decisions Made

| Topic | Decision |
|---|---|
| App name | Dev-Projects |
| Mode | Persistent launcher hub (stays open after launching) |
| Source roots | Configurable list; seeded with `C:\Dev\Active`, `C:\Dev\Archive`, `C:\Dev\Scratch`, `C:\Dev\Stable`, `C:\Dev\third-party` |
| Tech stack | PowerShell + WPF (XAML); prefers PowerShell 7 (`pwsh`), falls back to Windows PowerShell 5.1 (`powershell`) when pwsh is not installed — all code must be 5.1-compatible |
| Layout | Sidebar (roots as filters) + searchable project list (option A from mockups) |
| New project | Creates empty folder only (no git init, no templates), then auto-launches a fresh claude session in it |
| Terminal | Windows Terminal new tab in existing window (`wt.exe -w 0 new-tab`) |
| Launch actions | Per-project **New** (`claude`) and **Continue** (`claude --continue`) buttons + optional custom flags field |
| Structure | 4 files: `launcher.cmd` (shell-picking shim), `launcher.ps1`, `MainWindow.xaml`, `functions.ps1` + Pester tests |

## Architecture

```
Claude Cli Management\
├─ launcher.cmd                  # shim: runs launcher.ps1 with pwsh if present, else powershell 5.1
├─ launcher.ps1                  # entry: load XAML, wire events, run window
├─ MainWindow.xaml               # WPF UI (sidebar + list layout)
├─ functions.ps1                 # logic: config, scan, launch, create
└─ tests\functions.Tests.ps1     # Pester unit tests
```

`functions.ps1` contains all non-UI logic so it can be unit-tested without WPF.
`launcher.ps1` dot-sources it, loads the XAML, and wires UI events to functions.

### PowerShell version compatibility
- Preferred host: PowerShell 7 (`pwsh`). Fallback: Windows PowerShell 5.1
  (`powershell.exe`, always present on Windows 10/11).
- All `.ps1` code must be **5.1-compatible**: no `&&`/`||` pipeline chains, no
  ternary/null-coalescing operators, no `ConvertFrom-Json -AsHashtable`.
- A `Get-PreferredShell` helper in `functions.ps1` resolves `pwsh` via
  `Get-Command`, falling back to `powershell`; used for spawned terminal sessions.
- Both hosts default to STA on Windows (5.1 since PS 3.0; pwsh 7 verified) — WPF safe.

## Components

### Config
- Path: `%APPDATA%\Dev-Projects\config.json`
- Schema:
  ```json
  {
    "roots": ["C:\\Dev\\Active", "C:\\Dev\\Archive", "C:\\Dev\\Scratch",
              "C:\\Dev\\Stable", "C:\\Dev\\third-party"],
    "defaultRoot": "C:\\Dev\\Active",
    "ignore": [],
    "projects": {
      "C:\\Dev\\Active\\Hotel-Search": {
        "lastUsed": "2026-06-06T14:30:00Z",
        "flags": "--model opus"
      }
    }
  }
  ```
- Created with the seed defaults on first run if missing.
- Corrupt file: renamed to `config.json.bad`, defaults regenerated.

### Scanner
- Enumerates direct subfolders (one level) of each configured root; hidden folders and names starting with `.` are skipped.
- Folders listed in the optional config `ignore` array (exact names, e.g. `"notes"`) are skipped. No UI for this — hand-edit config.json.
- Produces project entries: name, root, full path, lastUsed (from config, may be null).
- Roots missing on disk are skipped and shown greyed-out in the sidebar.

### Launcher
- Command: `wt.exe -w 0 new-tab --title "<project name>" -d "<project path>" <shell> -NoExit -Command "claude <flags>"`
  where `<shell>` = `Get-PreferredShell` result (`pwsh`, else `powershell`).
- `-w 0` attaches the tab to the most recently used Windows Terminal window,
  or opens a new window if none exists.
- **New** button: `claude` + custom flags. **Continue** button: `claude --continue` + custom flags.
- Every launch updates the project's `lastUsed` and saves the current flags text
  to that project's `flags` in config.
- Arguments are built as arrays (never naive string concatenation); flags containing
  spaces or quotes are escaped correctly for both `wt.exe` and `Start-Process`.
- `wt.exe` detection: `Get-Command wt.exe`, falling back to probing the App Execution
  Alias at `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` (Store installs may not be on PATH).
- Fallback when `wt.exe` is not available:
  `Start-Process <shell> -WorkingDirectory <path> -ArgumentList '-NoExit','-Command','claude <flags>'`

### Creator (New Project dialog)
- Fields: project name (text) + destination root (dropdown).
- Dropdown preselects the currently selected sidebar root; if "All" is selected,
  preselects `defaultRoot`.
- Validation: non-empty, no invalid filename characters (`<>:"/\|?*`), folder must
  not already exist in the chosen root.
- "Launch Claude after creation" checkbox, default checked.
- On OK: creates the empty folder, closes the dialog, refreshes the list, and
  (if checkbox checked) auto-launches a fresh claude session in the new folder.
- Creation failure (permissions, path too long): message box; dialog stays open.

### Settings dialog
- Manage the roots list: Add (folder picker), Remove.
- Set the default root for new projects.
- Saves config and triggers a rescan on close.

### UI (MainWindow.xaml — layout A)
- **Left sidebar:** "All (n)" + one entry per root with project count; Settings entry at bottom. Acts as a filter for the list.
- **Main pane:**
  - Search box: live, case-insensitive substring filter on project name, applied within the current sidebar selection.
  - Custom flags textbox: bound to the currently selected project — selecting a row
    loads its saved flags; edits persist to config immediately (on change).
    **New/Continue buttons always launch with that row's saved flags.** No ambiguity:
    to change a project's flags, select it, edit, then launch.
  - Project list: rows show name, root tag, relative lastUsed; sorted lastUsed-desc, then name. Each row has **New** and **Continue** buttons.
  - Bottom bar: **＋ New Project** button, **Refresh** button (rescan roots to catch externally created folders).
- Warning banner shown at top if `claude` is not found on PATH at startup.
- Hub stays open after launches; user closes it manually.

## Startup & Distribution

- Launched via a desktop/Start Menu shortcut pointing at `launcher.cmd`, which picks
  the shell: `where pwsh` succeeds → `pwsh -WindowStyle Hidden -File launcher.ps1`,
  else `powershell -WindowStyle Hidden -File launcher.ps1`.
- Both hosts default to STA on Windows — no apartment-state handling needed for WPF.
- Single-instance guard: named mutex (`Global\Dev-Projects`); a second launch activates
  the existing window and exits. Also prevents concurrent config.json writes.

## Data Flow

1. Startup → load config (create defaults if missing) → scan roots → render sidebar + list.
2. Sidebar click → filter list to that root (or All).
3. Search input → live filter within current root selection.
4. New/Continue click → build command → spawn wt tab → update lastUsed + flags in config → re-sort list.
5. ＋ New Project → dialog → validate → create folder → refresh → auto-launch.
6. Settings → edit roots/defaultRoot → save → rescan.

## Error Handling

| Failure | Behaviour |
|---|---|
| `wt.exe` missing | Fall back to `Start-Process pwsh -WorkingDirectory ...` |
| `claude` not on PATH | Warning banner at startup; launches still attempted |
| `--continue` with no prior session | No pre-check; claude prints its own error in the tab |
| Corrupt config.json | Rename to `config.json.bad`, regenerate defaults |
| Root folder missing on disk | Greyed out in sidebar, skipped by scanner |
| Folder creation fails | Message box, New Project dialog stays open |

## Testing

- **Pester** (`tests\functions.Tests.ps1`) covering `functions.ps1`:
  - Config: load, save, defaults on first run, corrupt-file recovery.
  - Scanner: against temp directory trees.
  - Project name validation: invalid chars, empty, duplicates.
  - Launch command building: string/array assertions only, no real process spawn;
    includes flags containing spaces and quotes.
- **UI:** manual smoke test — start hub, search, filter by root, launch, create project, edit settings.

## Out of Scope (YAGNI)

- Git status / repo indicators per project.
- Embedded terminal.
- Project deletion/archiving from the hub.
- Templates (CLAUDE.md/README) on project creation.
- Compiled .exe distribution.
