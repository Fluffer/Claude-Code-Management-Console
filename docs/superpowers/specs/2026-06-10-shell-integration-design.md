# Windows Shell Integration — Design

**Date:** 2026-06-10
**Status:** Approved
**Scope:** Tray icon with quick-launch menu and close-to-tray, taskbar jump list, and a
"Copy deep link" context-menu item. One batch because all three ride the same two rails:
a shared menu-composition model and `ccmc://` deep links as the universal launch currency.

## Decisions (user-confirmed)

| Decision | Choice |
|---|---|
| Close/minimize behavior | Settings toggle "Close to tray", **default OFF**. ON: X hides to tray. OFF: X exits (current behavior). Minimize is always normal. |
| Tray menu contents | Pinned projects, then ~5 recent launches, then "Open ccmc", then "Exit". Left-click on the icon toggles window visibility. |
| Tray icon visibility | Always present (quick-launch value is independent of the close-to-tray setting). |
| Jump list contents | Mirrors the tray: "Pinned" and "Recent" categories, same data source. |
| Copy deep link format | Name-based: `ccmc://launch?project=<encoded-name>`. Resolved by the existing fuzzy matcher; survives folder moves between roots. |
| Tray implementation | Raw Win32 interop (`Shell_NotifyIcon` + `TrackPopupMenu`). No third-party dependency; matches the `GlobalHotkey` hand-rolled-interop precedent. |
| Jump list implementation | `ICustomDestinationList` COM interop with `IShellLink` items that invoke `ccmc.exe <deep-link-uri>` directly. Works packaged and unpackaged with one code path. |
| Protocol on unpackaged installs | Self-registration in `HKCU\Software\Classes\ccmc` at startup (idempotent, best-effort). Required: the daily-driver publish is unpackaged and the packaged-manifest registration does not apply to it. |

## Architecture

```
Ccmc.Core (testable, no UI)
  DeepLinkBuilder        Build(name, newSession) -> "ccmc://launch?project=..."
  ShellMenuComposer      (pinned, recents, cap) -> ordered entry model
  ActivationMessage      parse/format pipe payloads: ACTIVATE | LINK <uri>
  AppState.CloseToTray   new bool, default false

Ccmc.WinUI (thin guarded interop)
  Services/TrayIconService.cs      Shell_NotifyIcon, TrackPopupMenu, TaskbarCreated re-add
  Services/JumpListService.cs      ICustomDestinationList + IShellLink
  Services/ProtocolRegistrar.cs    HKCU\Software\Classes\ccmc -> "<exe>" "%1"
```

`ShellMenuComposer` is the single source of truth: the tray menu and the jump list render
the same entry model. Pinned entries are deduplicated out of the recents section; recents
are capped at 5 (tray) and 8 (jump list category).

## Activation flow

Today there are two activation paths; this design adds a third and unifies delivery:

1. **Packaged protocol activation** (existing) — WinRT `AppInstance` activation args.
   Unchanged.
2. **Unpackaged protocol / jump-list launch** (new) — Windows starts a second
   `ccmc.exe` with the URI in argv. Startup parses argv for a `ccmc://` argument.
3. **Single-instance forwarding** (extended) — when a second instance holds a link it
   sends `LINK <uri>` over the existing activation pipe instead of bare `ACTIVATE`,
   then exits. The primary's pipe server parses the payload with
   `ActivationMessage`, calls the existing `HandleDeepLink`, and activates the window.
   Bare launches keep sending `ACTIVATE`. Malformed payloads are ignored.

All three paths converge on `MainViewModel.HandleDeepLink`.

## Close-to-tray

`MainWindow` handles `AppWindow.Closing`: when `CloseToTray` is ON the close is
cancelled and the window is hidden. The process, activation pipe server, session
detection, and global hotkey stay alive. Tray-menu "Exit" sets a real-exit flag and
closes for real. The existing `Closed` cleanup (mutex release, pipe cancellation)
is unchanged and still runs on real exit.

SettingsDialog gains one toggle: "Close to tray" bound to `AppState.CloseToTray`.

## Jump list refresh triggers

Rebuilt (debounced, fire-and-forget) on: startup, after a session launch (recents
changed), and after pin/unpin. A rebuild failure is silently skipped — the previous
jump list simply persists.

## Copy deep link

Project context menu gains "Copy deep link": `DeepLinkBuilder.Build(project.Name)` →
`DataPackage` → clipboard, with a status-bar confirmation. No dialog.

## Error handling

Every interop surface is guarded and degrades silently, matching the `GlobalHotkey`
precedent:

- `Shell_NotifyIcon` add fails → no tray icon, app fully functional; close-to-tray
  toggle still honored (window hides; reachable via global hotkey or relaunch-activate).
- Explorer restarts → `TaskbarCreated` window message re-adds the icon.
- Registry write denied → copied links and protocol launches degrade; jump-list items
  still work because they invoke the exe directly.
- COM jump-list errors → swallowed.
- Pipe `LINK` payload malformed → treated as plain activate.

## Testing

- **Core (xUnit):** `DeepLinkBuilder` round-trips through `DeepLinkParser` (encoding,
  `new=true` flag); `ShellMenuComposer` ordering, pinned-out-of-recents dedup, caps,
  empty states; `ActivationMessage` parse/format including malformed input.
- **WinUI (manual smoke):** tray icon appears, menu launches a project, left-click
  toggles, Exit exits; jump list shows both categories and launches; link pasted in a
  browser reaches the running instance; close-to-tray honors the toggle both ways;
  Explorer restart keeps the icon.

## Out of scope

- Tray balloon/toast notifications (separate session-end-toast idea).
- Start-with-Windows toggle.
- MSIX/winget distribution.
- Any change to the packaged manifest protocol registration (already correct).
