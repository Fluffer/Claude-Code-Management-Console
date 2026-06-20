# Parity gap list — WinUI → Electron (2026-06-20)

Source-verified diff of `src/Ccmc.WinUI` (spec) vs `electron/src/renderer|main|core`.
Status: MISSING = absent, PARTIAL = present but incomplete/different, OK = parity.

## P0 — visible feature holes in main window

| # | Feature | WinUI | Electron | Status |
|---|---------|-------|----------|--------|
| 1 | **Row action buttons**: per-row "New", "Continue" (disabled if no session), "Resume session" history icon | MainWindow.xaml:336–343 | only in context menu, no row buttons | MISSING |
| 2 | **Model picker dropdown** on each project row | MainWindow.xaml:324 DropDownButton | — | MISSING |
| 3 | **Per-project flags row** + flag presets dropdown | MainWindow.xaml:126–138 FlagsBox/FlagMenu | — | MISSING |
| 4 | **Sort combo** (Last used / Name A–Z) | MainWindow.xaml:116 | backend supports, no UI | MISSING |
| 5 | **Command bar dropdowns**: Recent, Profiles, Groups, Filters | MainWindow.xaml:387–415 | only New/Refresh/StopAll present | MISSING |
| 6 | **Sidebar Help button** | MainWindow.xaml:85 | only Settings in sidebar | MISSING |
| 7 | **Context-menu conditional visibility** (CLAUDE.md only if HasClaudeMd; MCP if HasMcp; Stop if IsRunning; worktree if HasGitInfo; .claudeignore if exists) | MainWindow.xaml.cs:699–716 | all items always shown | MISSING |

## P1 — Settings / theming / onboarding

| # | Feature | WinUI | Electron | Status |
|---|---------|-------|----------|--------|
| 8 | **Accent color picker** | SettingsDialog AccentCombo | stored in AppState, not rendered, not applied by ThemeProvider | MISSING |
| 9 | **Font picker** | SettingsDialog FontCombo | stored in AppState, not rendered, not applied | MISSING |
| 10 | **Onboarding banner** + dismiss (no roots & !onboardingDismissed) | MainWindow.xaml:34 InfoBar | state+hook DONE, no UI, App.tsx never checks | PARTIAL |
| 11 | **Claude-missing warning banner** | MainWindow.xaml:29 InfoBar | — | MISSING |

## P2 — Phase 5 OS integration — DONE (commit 07bca07)

Spec: `docs/superpowers/specs/2026-06-20-phase5-os-integration-design.md`. Council-reviewed
(Ollama, 3 models) + verified live (all `[shell]` registrations succeed, no crash). GUI
behavior (icon visible, summon, jump list, link launch) is the user's to confirm in the window.

| # | Feature | WinUI | Electron | Status |
|---|---------|-------|----------|--------|
| 12 | **System tray** icon + left-click toggle + right-click menu (pinned/recent/open/exit) | TrayIconService.cs | `main/os/shellIntegration.ts` + pure `buildTrayMenuModel` | OK |
| 13 | **Global hotkey** Ctrl+Alt+Space summon | GlobalHotkey.cs | `globalShortcut` → show + `event:openPalette` | OK |
| 14 | **ccmc:// protocol registration + activation** | ProtocolRegistrar.cs + ActivationMessage | `setAsDefaultProtocolClient` + single-instance + `extractDeepLinkArg` + activationBuffer + renderer `useDeepLink` | OK |
| 15 | **Windows jump list** (pinned + recents → ccmc:// links) | JumpListService.cs | pure `buildJumpListCategories` → `app.setJumpList` | OK |
| 16 | **Close-to-tray** toggle behavior (toggle UI exists) | MainViewModel.CloseToTray | window `close` → hide; synchronous `loadStateSync` seed | OK |

## P3 — keyboard shortcuts + smaller diffs

| # | Feature | WinUI | Electron | Status |
|---|---------|-------|----------|--------|
| 17 | Global shortcuts: Ctrl+N (new), F5 (refresh), Ctrl+Shift+Enter (quick prompt), Enter on row | MainWindow.xaml accelerators | only F1, Esc, Ctrl+K(palette) | MISSING |
| 18 | Palette shortcut is **Ctrl+K** vs WinUI **Ctrl+P** | — | decide which | DIFFERENT |
| 19 | Drag-drop folder → add root / launch + drop overlay | MainWindow.xaml.cs:868 | — | MISSING |
| 20 | Status bar: Claude version text + update-available nudge | MainWindow.xaml:450–453 | count only | MISSING |
| 21 | Pin button amber hover color | MainWindow.xaml:244 | opacity fade only | PARTIAL |
| 22 | Command palette result cap (Electron 20 vs WinUI unlimited) | — | MAX_RESULTS=20 | DIFFERENT |

## Dialog field gaps (otherwise field-parity OK)
- EnvEditorDialog: missing "Values are hidden…" info banner.
- ProfileManagerDialog: missing "Plain tool names only…" helper text.
- HelpDialog: omits drop-folder mention (re-add once #19 lands).
- Several dialogs missing automation/test ids (palette, quick prompt).

## Notes
- All 21 ProjectAction *kinds* exist in ContextMenu.tsx; gap is conditional visibility (#7) + per-row buttons (#1), not the actions themselves.
- Most P2 work has its pure-TS half already ported (deep links, shell-menu compose); only the OS/IPC/renderer wiring is missing.
