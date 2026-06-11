# Project Deletion & Hiding — Design

Date: 2026-06-11
Status: Approved

## Goal

Let users remove projects from the console when no longer needed, via two actions:
a non-destructive **Hide from console** and a destructive **Delete from disk**.

## Background

Projects are auto-discovered by `ProjectScanner` enumerating subdirectories of
configured roots. There is no tracked project list to remove from, so "delete"
must either hide the folder from scanning or remove it from disk.

The existing `LauncherConfig.Ignore` list matches by directory **name**
(`ProjectScanner.cs:19-20`), so hiding e.g. "tools" would hide every project
named "tools" across all roots. It is unsuitable for per-project hiding and is
left untouched.

## UI

### Context menu (MainWindow.xaml, project row `MenuFlyout`)

New section at the bottom of the flyout, after a separator:

- **Hide from console** — non-destructive.
- **Delete from disk…** — destructive; opens confirmation dialog. Red/destructive
  styling on the menu item icon.

### Delete confirmation dialog (`ContentDialog`)

- Shows project name and full path.
- Warning row when git working tree is dirty (`ProjectItemViewModel.GitDirty`):
  "Uncommitted changes will be lost."
- Blocked when a Claude session is running for the project
  (`ProjectItemViewModel.IsRunning`): dialog shows "Stop the session first" and
  the Delete button is disabled.
- Checkbox: "Permanently delete (skip Recycle Bin)" — default unchecked.
- Primary button "Delete" with destructive (red) style; Cancel is the default
  button.

### Unhide

The Manage Roots dialog gains a small "Hidden projects" list showing hidden
paths with a **Restore** button per entry. This is the only place hidden paths
are visible; without it, hiding would be irreversible from the UI.

## Data model

`LauncherConfig` gains:

```csharp
public List<string>? Hidden { get; set; }   // full project paths, case-insensitive
```

`ProjectScanner.Scan` skips any directory whose full path is in `Hidden`
(OrdinalIgnoreCase comparison), in addition to the existing name-based `Ignore`
check. `ConfigService` normalization (`Load`) trims null/whitespace entries the
same way it does for `Ignore`.

## Behavior

### Hide from console

1. Add full project path to `config.Hidden` (no duplicates, case-insensitive).
2. Remove path from `state.Pinned` if pinned.
3. Save config + state, rescan.

### Delete from disk

New Core service `ProjectDeleter`:

- **Recycle Bin** (default):
  `Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory(path,
  UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin)`.
- **Permanent** (checkbox checked): `Directory.Delete(path, recursive: true)`
  with a fallback pass that clears `ReadOnly` attributes and retries — git
  object files are read-only and make a plain recursive delete fail.

Cleanup after successful delete:

1. Remove path from `state.Pinned` (state.json).
2. Remove path entry from `config.Projects` usage dict (config.json).
3. Remove the project's trust entry from `~/.claude.json` — new
   `ClaudeTrust.RemoveTrust(path)` mirroring `EnsureTrusted`'s key matching
   (OrdinalIgnoreCase).
4. Rescan.

Session transcripts under `~/.claude/projects` are intentionally left alone.

### Error handling

Delete failures (locked files, permissions) surface in an error dialog with the
exception message via `IUserDialogs`. Rescan runs regardless, since a partial
delete may have occurred.

## Testing

Unit tests in `tests-net` (Core layer, no UI):

- `ProjectScanner` skips paths in `Hidden`; name-based `Ignore` still works.
- Hide adds path once (no duplicate on repeat), case-insensitive.
- Config cleanup removes `Projects` entry; state cleanup removes pin.
- `ClaudeTrust.RemoveTrust` removes the matching key from a temp
  `~/.claude.json` fixture, preserving other content; tolerates missing
  file/key.
- Permanent delete removes a temp directory tree containing read-only files.

Not unit-tested: Recycle Bin call (shell API) — manual verification; dialog UI.

## Out of scope

- Deleting Claude session transcripts.
- Bulk delete / multi-select.
- Undo beyond the Recycle Bin.
