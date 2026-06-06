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
| Tech stack | PowerShell 7 + WPF (XAML) |
| Layout | Sidebar (roots as filters) + searchable project list (option A from mockups) |
| New project | Creates empty folder only (no git init, no templates), then auto-launches a fresh claude session in it |
| Terminal | Windows Terminal new tab in existing window (`wt.exe -w 0 new-tab`) |
| Launch actions | Per-project **New** (`claude`) and **Continue** (`claude --continue`) buttons + optional custom flags field |
| Structure | 3 files: `launcher.ps1`, `MainWindow.xaml`, `functions.ps1` + Pester tests |

## Architecture

```
Claude Cli Management\
├─ launcher.ps1                  # entry: load XAML, wire events, run window
├─ MainWindow.xaml               # WPF UI (sidebar + list layout)
├─ functions.ps1                 # logic: config, scan, launch, create
└─ tests\functions.Tests.ps1     # Pester unit tests
```

`functions.ps1` contains all non-UI logic so it can be unit-tested without WPF.
`launcher.ps1` dot-sources it, loads the XAML, and wires UI events to functions.

## Components

### Config
- Path: `%APPDATA%\Dev-Projects\config.json`
- Schema:
  ```json
  {
    "roots": ["C:\\Dev\\Active", "C:\\Dev\\Archive", "C:\\Dev\\Scratch",
              "C:\\Dev\\Stable", "C:\\Dev\\third-party"],
    "defaultRoot": "C:\\Dev\\Active",
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
- Produces project entries: name, root, full path, lastUsed (from config, may be null).
- Roots missing on disk are skipped and shown greyed-out in the sidebar.

### Launcher
- Command: `wt.exe -w 0 new-tab --title "<project name>" -d "<project path>" pwsh -NoExit -Command "claude <flags>"`
- `-w 0` attaches the tab to the most recently used Windows Terminal window,
  or opens a new window if none exists.
- **New** button: `claude` + custom flags. **Continue** button: `claude --continue` + custom flags.
- Every launch updates the project's `lastUsed` and saves the current flags text
  to that project's `flags` in config.
- Fallback when `wt.exe` is not available:
  `Start-Process pwsh -WorkingDirectory <path> -ArgumentList '-NoExit','-Command','claude <flags>'`

### Creator (New Project dialog)
- Fields: project name (text) + destination root (dropdown).
- Dropdown preselects the currently selected sidebar root; if "All" is selected,
  preselects `defaultRoot`.
- Validation: non-empty, no invalid filename characters (`<>:"/\|?*`), folder must
  not already exist in the chosen root.
- On OK: creates the empty folder, closes the dialog, refreshes the list, and
  auto-launches a fresh claude session in the new folder.
- Creation failure (permissions, path too long): message box; dialog stays open.

### Settings dialog
- Manage the roots list: Add (folder picker), Remove.
- Set the default root for new projects.
- Saves config and triggers a rescan on close.

### UI (MainWindow.xaml — layout A)
- **Left sidebar:** "All (n)" + one entry per root with project count; Settings entry at bottom. Acts as a filter for the list.
- **Main pane:**
  - Search box: live, case-insensitive substring filter on project name, applied within the current sidebar selection.
  - Custom flags textbox: selecting a project row loads that project's saved flags
    into the textbox. **New/Continue on the currently selected row uses the textbox
    content; on any other row uses that project's saved flags** (the click does not
    steal the textbox). Flags used by a launch are saved back to that project.
  - Project list: rows show name, root tag, relative lastUsed; sorted lastUsed-desc, then name. Each row has **New** and **Continue** buttons.
  - Bottom bar: **＋ New Project** button, **Refresh** button (rescan roots to catch externally created folders).
- Warning banner shown at top if `claude` is not found on PATH at startup.
- Hub stays open after launches; user closes it manually.

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
  - Launch command building: string assertions only, no real process spawn.
- **UI:** manual smoke test — start hub, search, filter by root, launch, create project, edit settings.

## Out of Scope (YAGNI)

- Git status / repo indicators per project.
- Embedded terminal.
- Project deletion/archiving from the hub.
- Templates (CLAUDE.md/README) on project creation.
- Compiled .exe distribution.
