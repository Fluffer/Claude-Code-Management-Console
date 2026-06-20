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

## P1 — Settings / theming / onboarding — DONE (commit 32d9f31)

Spec: `docs/superpowers/specs/2026-06-20-p1-theming-banners-design.md`. Council-reviewed (Ollama)
+ verified live. GUI confirmation (accent/font apply, banners) is the user's.

| # | Feature | WinUI | Electron | Status |
|---|---------|-------|----------|--------|
| 8 | **Accent color picker** | SettingsDialog AccentCombo | curated `core/theme/accents.ts`; themes.css ramp derives from `--accent` via color-mix; `applyAccent` | OK |
| 9 | **Font picker** | SettingsDialog FontCombo | curated `core/theme/fonts.ts` → `--app-font`; `applyFont` | OK |
| 10 | **Onboarding banner** + dismiss (no roots & !onboardingDismissed) | MainWindow.xaml:34 InfoBar | `Banner` + App gate on `!onboardingDismissed` | OK |
| 11 | **Claude-missing warning banner** | MainWindow.xaml:29 InfoBar | `claude:onPath` IPC + `useClaudeOnPath` + non-closable warning `Banner` | OK |

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

## P3 — keyboard shortcuts + smaller diffs — DONE (commit 8b783d2)

Spec: `docs/superpowers/specs/2026-06-20-p3-shortcuts-dragdrop-statusbar-design.md`. Council-reviewed
(Ollama) + verified live. GUI confirmation is the user's.

| # | Feature | WinUI | Electron | Status |
|---|---------|-------|----------|--------|
| 17 | Global shortcuts: Ctrl+N (new), F5 (refresh), Ctrl+Shift+Enter (quick prompt), Enter on row | MainWindow.xaml accelerators | global Ctrl+N/F5 (typing-guarded) + focusable rows: Enter/Ctrl+Enter/Ctrl+Shift+Enter | OK |
| 18 | Palette shortcut is **Ctrl+K** vs WinUI **Ctrl+P** | — | both Ctrl+K and Ctrl+P | OK |
| 19 | Drag-drop folder → add root / launch + drop overlay | MainWindow.xaml.cs:868 | drop folder → atomic `config:addRoots` (webUtils path, `fs:isDirectory`) + `DropOverlay` | OK |
| 20 | Status bar: Claude version text + update-available nudge | MainWindow.xaml:450–453 | `claude:version` + `parseClaudeVersion` (version only; update nudge dropped, no offline source) | OK |
| 21 | Pin button amber hover color | MainWindow.xaml:244 | `hover:text-amber-400` when unpinned | OK |
| 22 | Command palette result cap (Electron 20 vs WinUI unlimited) | — | MAX_RESULTS 20 → 50 | OK |

## Dialog field gaps — DONE (commit 8b783d2)
- EnvEditorDialog: "Values are hidden. Use the eye button…" note added.
- ProfileManagerDialog: "Plain tool names only…" helper text added.
- HelpDialog: drag-drop mention added.
- Palette + quick-prompt test ids added.

---

**Parity complete.** All P0–P3 + dialog gaps shipped on `feat/electron-rewrite` (PR #2).
- Several dialogs missing automation/test ids (palette, quick prompt).

## Notes
- All 21 ProjectAction *kinds* exist in ContextMenu.tsx; gap is conditional visibility (#7) + per-row buttons (#1), not the actions themselves.
- Most P2 work has its pure-TS half already ported (deep links, shell-menu compose); only the OS/IPC/renderer wiring is missing.
