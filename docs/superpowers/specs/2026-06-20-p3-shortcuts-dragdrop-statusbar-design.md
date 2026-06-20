# Design — P3 keyboard shortcuts, drag-drop, status-bar version, palette + dialog polish

**Date:** 2026-06-20 · **Branch:** `feat/electron-rewrite`
Closes parity gaps P3 #17–#22 + the remaining dialog field gaps. After this, full WinUI→Electron
parity. WinUI reference: `MainWindow.xaml` accelerators + InfoBars + status bar; `MainViewModel`.
Electron today: App.tsx handles only Ctrl+K (palette), F1 (help), Esc (clear search); rows are
non-focusable divs; palette `MAX_RESULTS = 20`; status bar shows project/session counts; no drag-drop.

## #17 Keyboard shortcuts

- **Global** (App.tsx `keydown` listener, extend the existing one):
  - `Ctrl+N` → `openDialog({ kind: 'new-project', roots })` (preventDefault).
  - `F5` → `refresh()` (preventDefault).
  - `Ctrl+K` **or** `Ctrl+P` → toggle the palette (preventDefault both; #18). Keep F1=help, Esc=clear.
- **Row-level** (`ProjectRow`): the row container gets `tabIndex={0}`, a visible focus ring, and an
  `onKeyDown`. To avoid hijacking the row's inner buttons, handle only when `e.target === e.currentTarget`
  (the row itself is focused, not a child button):
  - `Enter` → `launch-continue`, `Ctrl+Enter` → `launch-new`, `Ctrl+Shift+Enter` → `launch-quick-prompt`.
  Native Tab / Shift+Tab moves between rows — no custom arrow-roving (YAGNI). The launch keys dispatch
  the same `ProjectAction`s the row buttons already use.

## #18 Palette shortcut

Palette opens on `Ctrl+K` OR `Ctrl+P` (`metaKey` too, for parity with the existing Cmd+K). Both
`preventDefault` (Ctrl+P is the browser print shortcut). Update the status-bar hint string and the
onboarding banner copy to mention Ctrl+K / Ctrl+P.

## #22 Palette result cap

`features/palette/CommandPalette.tsx`: `MAX_RESULTS` 20 → **50**.

## #19 Drag-drop a folder → add it as a source root

- **Preload** (`preload.ts`): expose `pathForFile(file: File): string` using `webUtils.getPathForFile`
  (Electron 32 — `File.path` is undefined under `sandbox:true`, so `webUtils` is required). Add to the
  `ccmc` api object and to `api.d.ts` / `CcmcApi` typing.
- **IPC**: `fs:isDirectory` req `{ path }` res `{ ok: boolean }` — main `stat(path).isDirectory()`,
  fail-soft `false`. Add to `shared/ipc.ts` + a handler in `handlers.ts`.
- **Renderer** (App.tsx root element): `onDragOver` → `preventDefault()` + show a drop overlay;
  `onDragLeave` → hide; `onDrop` → `preventDefault()`, map `e.dataTransfer.files` through
  `window.ccmc.pathForFile`, filter to directories via `fs:isDirectory`, then for each new path not
  already in `config.roots` do config:read → config:write with the appended root, `refresh()` +
  `reloadConfig()`, and toast a summary ("Added N source root(s)"). Ignore non-directories with a toast.
- **DropOverlay** component: a full-area translucent overlay shown while dragging, label
  "Drop a folder to add it as a source root". `pointer-events-none` except it must not block the drop
  (handle drag events on the root container, render overlay above content).

## #20 Status-bar Claude version (version only — no update nudge)

- `core/claude/claudeVersion.ts` (pure, tested): `parseClaudeVersion(stdout: string): string | null` —
  extract a semver-ish version (e.g. from `claude 1.2.3 (Claude Code)` or `1.2.3`). Null if absent.
- **IPC**: `claude:version` req void res `{ version: string | null }`. Handler: resolve `claude` via
  `commandLocator.findOnPath('claude')`; if null → `{ version: null }`; else `execFile(claudePath,
  ['--version'], { timeout, windowsHide:true })` → `parseClaudeVersion(stdout)`. Fail-soft → null.
- `useClaudeVersion` hook: invoke once on mount; return `{ version }`. (No refresh subscription — a
  CLI version doesn't change mid-session.)
- App.tsx footer: when `version` is non-null, show `· Claude v{version}` after the existing counts.

## #21 Pin button amber hover

`ProjectRow` pin button: when the project is NOT pinned, the star gets an amber hover color
(`hover:text-amber-400` / appropriate token) instead of only an opacity fade — matching WinUI's amber
hover. Pinned state keeps its filled/active styling.

## Dialog polish (completes field parity)

- `EnvEditorDialog`: add an info note "Values are hidden for security; edit the raw file to view them."
  (port the WinUI banner text — verify exact wording against `EnvEditorDialog.xaml`).
- `ProfileManagerDialog`: add helper text "Plain tool names only — no `mcp__` prefixes." (verify wording).
- `HelpDialog`: add a line mentioning drag-drop ("Drop a folder onto the window to add it as a source
  root.") now that #19 exists.
- Add missing `data-testid` / automation ids on the command palette and quick-prompt dialog
  (match how other dialogs set ids).

## Verification

- Unit-tested: `parseClaudeVersion` (pure), `fs:isDirectory` handler, `claude:version` handler (mock
  commandLocator + execFile), the row keyboard dispatch, global Ctrl+N/F5/Ctrl+P handling, palette cap
  (update the palette test), and a drag-drop add-root test (mock `pathForFile` + `fs:isDirectory`).
- Gates: `npm run build`, `npm run lint`, `npx vitest run` green.
- Council (Ollama, cap 3) reviews the drag-drop path handling (sandbox/webUtils, directory validation,
  duplicate-root guard) + the version spawn.
- Live: launch, exercise Ctrl+N/F5/Ctrl+P, focus a row and press Enter/Ctrl+Enter, drop a folder, see
  the Claude version in the status bar. GUI confirmation is the user's (the project discipline).

## Non-goals (YAGNI)

Arrow-key roving selection, update-available nudge, drag-drop launch / choice mode, multi-file drop
semantics beyond "add each dropped directory as a root".
