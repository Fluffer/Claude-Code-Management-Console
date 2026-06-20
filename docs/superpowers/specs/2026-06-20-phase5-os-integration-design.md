# Phase 5 — Windows OS integration (parity gaps P2 #12–16)

**Date:** 2026-06-20 · **Branch:** `feat/electron-rewrite`
Ports `src/Ccmc.WinUI/Services/{TrayIconService,GlobalHotkey,ProtocolRegistrar,JumpListService}.cs`
and `App.xaml.cs` single-instance/activation. The pure halves (`composeShellMenu`,
`deepLinkParser`/`deepLinkBuilder`) are already ported and tested. Electron collapses all the
Win32/COM interop into native APIs, so this is OS/IPC/renderer wiring + a few new pure models.

## Native API mapping

| Feature | WinUI (Win32/COM) | Electron |
|---|---|---|
| #12 Tray | `Shell_NotifyIcon` + `TrackPopupMenuEx` | `new Tray(icon)` + `Menu.buildFromTemplate` |
| #13 Global hotkey | `RegisterHotKey` WM_HOTKEY | `globalShortcut.register('Control+Alt+Space')` |
| #14 Protocol + activation | `ProtocolRegistrar` registry write + named-pipe single instance | `app.setAsDefaultProtocolClient('ccmc')` + `app.requestSingleInstanceLock()` / `second-instance` |
| #15 Jump list | `ICustomDestinationList` COM | `app.setJumpList([categories])` |
| #16 Close-to-tray | `AppWindow.Closing` cancel + Hide | window `close` event → `preventDefault()` + `hide()` |

## New pure models (TDD, no electron import) — `electron/src/core/...`

1. `links/deepLinkArg.ts` — `extractDeepLinkArg(argv: string[]): string | null`
   First arg starting with `ccmc://` (case-insensitive). Mirrors `App.xaml.cs:142`.
2. `launch/trayMenuModel.ts` — `buildTrayMenuModel(entries: ShellMenuEntry[]): TrayMenuItem[]`
   `TrayMenuItem = {kind:'project',label,path} | {kind:'separator'} | {kind:'empty'} | {kind:'open'} | {kind:'exit'}`.
   Order mirrors `TrayIconService.ShowMenu`: pinned, separator (only if both pinned & recents), recents,
   `{empty:"No recent projects"}` when zero entries, separator, open ("Open ccmc"), exit ("Exit").
3. `launch/jumpListModel.ts` — `buildJumpListCategories(entries, exePath): JumpListCategory[]`
   Pinned category + Recent category (cap 8), each item `{ type:'task', program:exePath,
   args: deepLinkBuilder.build(label), title: label, description:"Launch Claude in <label>" }`.
   Mirrors `JumpListService` (jump-list args use the entry **label/name**, as in C#).
   Empty categories are omitted.

Tray menu uses `composeShellMenu(pinned, recents, recentCap=5)`; jump list uses `recentCap=8`.

## IPC additions — `shared/ipc.ts`

- `IpcEvents['event:openPalette']: void` — main → renderer; hotkey summon opens the command palette
  (parity: WinUI summon shows palette). `event:deepLink` already exists.

## Main wiring — `electron/src/main/`

New module `os/shellIntegration.ts` (electron-dependent, not unit-tested — like `ipc/register.ts`).
Exposes `installShellIntegration({ win, statePath, onLaunchPath, getIconPath })` returning a disposer.
Responsibilities, all **fail-soft** (a refused registration logs and continues — never crashes startup):

- **Single instance:** `app.requestSingleInstanceLock()`. If not acquired → parse own argv for a
  `ccmc://` arg and quit (the running instance handles it). On `second-instance(_, argv)` →
  `extractDeepLinkArg(argv)`; if present `win.webContents.send('event:deepLink', { url })`; always
  show+focus the window.
- **Protocol:** `app.setAsDefaultProtocolClient('ccmc')` (idempotent, fail-soft).
- **Tray:** build from `buildTrayMenuModel(composeShellMenu(pinned, recents, 5))`; left-click toggles
  window; project click → `onLaunchPath(path)`; open → show+focus; exit → real-quit. Icon resolved
  via `getIconPath()`; if missing/throws, skip the tray.
- **Global hotkey:** `globalShortcut.register('Control+Alt+Space', summon)` where summon =
  show+focus window then `send('event:openPalette')`. Log when the combo is unavailable.
- **Jump list:** `app.setJumpList(buildJumpListCategories(composeShellMenu(pinned, recents, 8), exe))`.
- **Close-to-tray:** read `state.closeToTray`; on window `close`, if true and not really-exiting,
  `preventDefault()`+`hide()`. Tray "Exit" sets really-exit then `app.quit()`.
- **Rebuild on state change:** the existing `watchPaths([config,state])` callback also re-reads state
  and refreshes tray menu + jump list (pins/recents change there).

First-launch deep link: after the window is ready, `extractDeepLinkArg(process.argv)` → send
`event:deepLink`.

`onLaunchPath(path)`: resolve to a `ccmc://launch?project=<path>` and route through the same
renderer deep-link handler (send `event:deepLink`) so launch logic lives in one place (the renderer,
which owns the project list + flags). Path-or-name resolution already exists in the renderer handler.

Icon: `electron/resources/app.ico` (copied from WinUI). Dev path `join(__dirname,'../../resources/app.ico')`,
packaged `join(process.resourcesPath,'app.ico')` — fail-soft if absent.

## Renderer — `electron/src/renderer/`

- `hooks/useDeepLink.ts`: subscribes `event:deepLink`; on each, `deepLinkParser.parse(url)`, then
  resolve a `ProjectInfo` by **path or name** (case-insensitive, against the full `projects` list,
  not the filtered view — mirrors `MainViewModel.HandleDeepLink`), and dispatch launch
  (`new=true` → launch-new, else launch-continue). Unknown project → toast. Action `!== 'launch'` → ignore.
- `App.tsx`: subscribe `event:openPalette` → `setPaletteOpen(true)` + focus; mount `useDeepLink`
  wired to `onAction` + `projects` + `showToast`.

## Verification

- Gates: `npm run build`, `npm run lint`, `npx vitest run` all green. New pure models fully covered.
- Council (Ollama `*_second_opinion`, cap 3) reviews the main wiring + models.
- Live: launch `npm run dev`, read main-process stdout for fail-soft registration logs and **no crash**.
  GUI confirmation (icon visible, hotkey summons, jump list populated, link launches) is left for the
  user — the project discipline: unit-green ≠ working.
