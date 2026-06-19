# CCMC Electron Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Windows-only WinUI 3 / .NET app with a single cross-platform (Windows + macOS) Electron + TypeScript app at behavior parity, reusing zero C#.

**Architecture:** Three layers. (1) **`core/`** — pure TypeScript modules, no Electron, no `electron` import, fully unit-testable with vitest (config parsing, fuzzy match, filter, command building, git/ps output parsing, deep-link build/parse). (2) **`main/`** — thin Electron main-process orchestration: OS integration (process inspect/kill, terminal launch, git spawn, file watch, tray, hotkey, protocol) + typed IPC handlers that call `core/`. (3) **`renderer/`** — React + Vite + Tailwind UI, `contextIsolation` on, `nodeIntegration` off, talks to main only through a `contextBridge` preload. Platform differences are isolated behind per-OS strategy modules (`*.win.ts` / `*.mac.ts`) selected at runtime.

**Tech Stack:** Electron, TypeScript, React, Vite, Tailwind, vitest (unit), execa (process spawning), chokidar (file watch), electron-builder (NSIS + dmg, notarized). No `exec`/shell — `spawn` with `shell:false` and array args everywhere.

**Why this order:** The council (3 independent models) unanimously flagged that the deadliest, least-reversible risks are macOS **process detection/kill** and **terminal launching**, and JSON **byte-parity** with the live Claude CLI. Those are spiked and proven on real macOS *before* any UI is built. If the core OS integration can't be made reliable on Mac, we learn it in week one, not month three.

---

## Source-of-Truth Map (what each new module replaces)

Reimplement behavior from these C# files. Read each before porting its TS equivalent; preserve exact file formats and command strings.

| New TS module | Replaces (C#) | Notes |
|---|---|---|
| `core/config/configService.ts` | `ConfigService.cs`, `StateService.cs`, `ConfigSnapshot.cs` | JSON at `~/.claude`; byte-parity + atomic write |
| `core/config/envFileEditor.ts` | `EnvFileEditor.cs` | preserve comments/order |
| `core/config/flagsEditor.ts`, `flagCatalog.ts` | `FlagsEditor.cs`, `ClaudeFlagCatalog.cs` | |
| `core/config/mcpConfigReader.ts` | `McpConfigReader.cs` | |
| `core/config/settingsJsonValidator.ts` | `SettingsJsonValidator.cs` | |
| `core/projects/projectScanner.ts` | `ProjectScanner.cs` | fs walk, symlink-aware |
| `core/projects/projectFilter.ts`, `projectSearch.ts`, `fuzzyMatcher.ts` | `ProjectFilter.cs`, `ProjectSearch.cs`, `FuzzyMatcher.cs` | pure logic — test first |
| `core/projects/projectNameValidator.ts`, `projectDescription.ts`, `projectClaudeInfo.ts`, `projectModelInfo.ts` | matching `.cs` | pure logic |
| `core/projects/mruList.ts` | `MruList.cs` | pure logic |
| `core/claude/sessionLister.ts`, `sessionDetector.ts`, `sessionEndDetector.ts`, `sessionStaleness.ts`, `sessionSummary.ts` | matching `.cs` | parse `~/.claude/projects` |
| `core/claude/readiness.ts`, `trust.ts`, `versionInfo.ts`, `ignoreInfo.ts` | matching `.cs` | |
| `core/launch/launchCommandBuilder.ts` | `LaunchCommandBuilder.cs` | **per-OS**; was `wt.exe` string |
| `core/launch/argumentEscaper.ts` | `ArgumentEscaper.cs` | pure logic — security-critical |
| `core/launch/profileComposer.ts`, `shellMenuComposer.ts` | `ProfileComposer.cs`, `ShellMenuComposer.cs` | |
| `core/links/deepLinkBuilder.ts`, `deepLinkParser.ts` | `DeepLinkBuilder.cs`, `DeepLinkParser.cs` | pure logic |
| `core/util/relativeTimeFormatter.ts`, `appPaths.ts` | `RelativeTimeFormatter.cs`, `AppPaths.cs` | `appPaths` per-OS |
| `core/git/gitOutputParser.ts` | parsing half of `GitInfoProvider.cs`, `GitWorktreeProvider.cs` | pure parse — test with fixtures |
| `main/os/processInspector.{win,mac}.ts` | `ProcessInspector.cs` (kernel32 P/Invoke), `RunningClaudeDetector.cs` | **highest risk** |
| `main/os/sessionKiller.{win,mac}.ts` | `SessionKiller.cs` | signals/process groups |
| `main/os/terminalLauncher.{win,mac}.ts` | `SessionLauncher.cs`, `CommandLocator.cs`, `ClaudeCliService.cs` | **highest risk**; AppleScript on Mac |
| `main/os/gitRunner.ts` | spawn half of git providers | spawn `git`, feed `gitOutputParser` |
| `main/os/tray.{win,mac}.ts` | `TrayIconService.cs` | menu-bar extra on Mac |
| `main/os/hotkey.ts` | `GlobalHotkey.cs` | Accessibility perm on Mac |
| `main/os/protocol.ts` | `ProtocolRegistrar.cs` | Info.plist + single-instance |
| `main/os/jumpList.win.ts` | `JumpListService.cs` | **Windows-only**; Mac = Dock menu or no-op |
| Models → `core/models/*.ts` (types) | all of `src/Ccmc.Core/Models/*.cs` | plain interfaces |

Models to port as TS interfaces: `AppState`, `GitInfo`, `GitWorktree`, `LauncherConfig`, `LaunchGroup`, `LaunchProfile`, `LaunchSpec`, `McpServerInfo`, `ProjectInfo`, `RunningSession`, `SavedFilter`, `SessionSummary`.

Views to port as React components (13 dialogs + main + help): `MainWindow`, `HelpWindow`, `CommandPaletteDialog`, `DeleteProjectDialog`, `EnvEditorDialog`, `GroupManagerDialog`, `McpViewerDialog`, `NewProjectDialog`, `ProfileManagerDialog`, `QuickPromptDialog`, `RenameProjectDialog`, `ResumeSessionDialog`, `SavedFilterDialog`, `SettingsDialog`, `WorktreePickerDialog`.

---

## Repo layout (target)

```
electron/                 # new app root (keeps legacy C# in src/ untouched until cutover)
  package.json
  electron.vite.config.ts
  tsconfig.json
  src/
    core/                 # pure TS, no electron import (enforced by lint rule)
    main/                 # electron main process
    preload/              # contextBridge
    renderer/             # React + Vite + Tailwind
    shared/               # IPC channel names + payload types (imported by main + preload + renderer)
  tests/                  # vitest; core/ has full coverage
  build/                  # entitlements.mac.plist, icons, notarize script
```

---

## Phase 0 — De-risking spike (DO FIRST, throwaway-OK code)

Goal: on a real Mac, prove the three things that can kill this project. No UI, no architecture polish. A spike that fails here changes the whole project (back to Uno/Avalonia). **Run these on a real macOS machine/VM, not just Windows.**

### Task 0.1: Scaffold minimal Electron + TS app

**Files:**
- Create: `electron/package.json`, `electron/electron.vite.config.ts`, `electron/tsconfig.json`
- Create: `electron/src/main/main.ts` (opens one BrowserWindow)
- Create: `electron/src/preload/preload.ts` (empty contextBridge)
- Create: `electron/src/renderer/index.html`, `electron/src/renderer/main.tsx`

- [ ] **Step 1:** Init project.
```bash
cd electron
npm create @quick-start/electron@latest . -- --template react-ts
npm install
```
- [ ] **Step 2:** Run dev shell.
```bash
npm run dev
```
Expected: a blank Electron window opens on this OS.
- [ ] **Step 3:** Confirm security defaults in `main.ts` BrowserWindow `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Fix if the template differs.
- [ ] **Step 4:** Commit.
```bash
git add electron && git commit -m "chore(electron): scaffold spike shell"
```

### Task 0.2: SPIKE — macOS process detection of Claude CLI

**Files:** Create `electron/spike/ps-mac.ts`

- [ ] **Step 1:** Start a real `claude` session in a terminal on the Mac.
- [ ] **Step 2:** Write a spike that lists processes three ways and prints full command lines + PID + PPID:
```ts
import { execa } from 'execa'
// A: ps with wide output
const { stdout: ps } = await execa('ps', ['-axww', '-o', 'pid,ppid,lstart,command'])
// B: pgrep by name
const { stdout: pg } = await execa('pgrep', ['-fl', 'claude']).catch(e => e)
console.log('PS:\n', ps.split('\n').filter(l => /claude/.test(l)).join('\n'))
console.log('PGREP:\n', pg)
```
- [ ] **Step 3:** Run it: `npx tsx electron/spike/ps-mac.ts`.
- [ ] **Step 4:** Verify you can (a) see the `claude` process, (b) read its FULL args (not truncated), (c) get PPID to build the tree, (d) distinguish a real interactive session from a wrapper shell. **Record findings in `electron/spike/FINDINGS.md`.** If `ps -axww` truncates or hides args, try `lsof -p <pid>` for cwd and note it.
- [ ] **Step 5:** Decide the canonical detection command + parse rule. This becomes `processInspector.mac.ts`.

### Task 0.3: SPIKE — kill a Claude session on macOS cleanly

- [ ] **Step 1:** With a known PID from 0.2, try graceful then forced kill, observing orphans:
```ts
process.kill(pid, 'SIGTERM')   // wait ~2s, re-check with 0.2
process.kill(pid, 'SIGKILL')   // if still alive
```
- [ ] **Step 2:** Check for orphaned child processes (the shell, node, or git the session spawned). Test killing the process **group** (`process.kill(-pgid, 'SIGTERM')`) vs single PID. Record which leaves no zombies.
- [ ] **Step 3:** Record the chosen kill strategy in `FINDINGS.md`. This becomes `sessionKiller.mac.ts`.

### Task 0.4: SPIKE — launch a terminal running `claude` on macOS

- [ ] **Step 1:** Try Terminal.app via osascript, passing cwd + command:
```ts
const script = `tell application "Terminal" to do script "cd ${q(dir)} && claude"`
await execa('osascript', ['-e', script])
```
- [ ] **Step 2:** Try iTerm2 via its AppleScript dictionary (separate script). Detect which terminals are installed (`/Applications/iTerm.app` exists?).
- [ ] **Step 3:** Verify: new window/tab opens, correct working directory, `claude` actually starts with a real TTY, env vars propagate. Note any TTY/quoting problems. Record in `FINDINGS.md`. This becomes `terminalLauncher.mac.ts`.
- [ ] **Step 4:** Decide quoting/escaping rule (feeds `argumentEscaper.ts` security tests). Confirm `spawn` with `shell:false` for the `osascript` call; never string-concat untrusted input into the shell.

### Task 0.5: SPIKE — JSON byte-parity with the live CLI

**Files:** Create `electron/spike/json-parity.ts`

- [ ] **Step 1:** Copy a real `~/.claude/settings.json` (and `.claude.json`) produced by the actual Claude CLI to a fixture.
- [ ] **Step 2:** Read it, parse, re-serialize with a candidate writer, and diff bytes:
```ts
import { readFileSync } from 'node:fs'
const raw = readFileSync(fixture, 'utf8')
const obj = JSON.parse(raw)
const out = JSON.stringify(obj, null, 2) + '\n'   // candidate format
console.log(raw === out ? 'BYTE MATCH' : 'DIFF')
```
- [ ] **Step 3:** Adjust indentation / trailing newline / key handling until round-trip is byte-identical (or document the minimal acceptable diff that the CLI tolerates). Record the exact serialization rule in `FINDINGS.md`. This rule is binding for `configService.ts`.
- [ ] **Step 4:** Test an **atomic write**: write to `settings.json.tmp` then `fs.rename` over the original; confirm no corruption if interrupted.

### Task 0.6: Spike gate

- [ ] **Step 1:** Review `FINDINGS.md`. Gate question: can we reliably detect, kill, launch, and round-trip on macOS? If **any** is "no", STOP and reconsider framework (this is the cheap exit). If "yes", proceed — the risky unknowns are now known patterns.
- [ ] **Step 2:** Commit spike + findings.
```bash
git add electron/spike && git commit -m "spike(electron): prove mac process/terminal/json viability"
```

---

## Phase 1 — Foundation: types, IPC contract, lint guardrails

### Task 1.1: Port models as TS interfaces

**Files:** Create `electron/src/core/models/*.ts` (one per model), `electron/tests/core/models.test.ts`

- [ ] **Step 1:** For each of the 12 models, read the C# record/class and write the TS interface mirroring property names exactly (camelCase only if you also adjust JSON mapping; **default to preserving the on-disk JSON keys**). Example for `ProjectInfo`:
```ts
export interface ProjectInfo {
  path: string
  name: string
  // ...mirror every field from ProjectInfo.cs, keeping JSON key casing
}
```
- [ ] **Step 2:** Add a compile check test that imports all models (catches syntax errors).
```ts
import * as M from '../../src/core/models'
test('models load', () => { expect(Object.keys(M).length).toBeGreaterThan(0) })
```
- [ ] **Step 3:** Run: `npx vitest run tests/core/models.test.ts` → PASS.
- [ ] **Step 4:** Commit: `git commit -am "feat(core): port domain models to TS"`.

### Task 1.2: Define the IPC contract (shared channel + payload types)

**Files:** Create `electron/src/shared/ipc.ts`

- [ ] **Step 1:** Declare every channel name and its request/response type in one place, e.g.:
```ts
export const IPC = {
  projectsScan: 'projects:scan',
  sessionsList: 'sessions:list',
  sessionKill: 'sessions:kill',
  launch: 'launch:run',
  configRead: 'config:read',
  configWrite: 'config:write',
  // ...one per use case
} as const
export interface IpcMap {
  [IPC.projectsScan]: { req: { root: string }; res: ProjectInfo[] }
  // ...
}
```
- [ ] **Step 2:** Add typed `invoke` helper + handler-registration helper so main and renderer share types. No `any` on the boundary.
- [ ] **Step 3:** Commit: `git commit -am "feat(ipc): typed channel contract"`.

### Task 1.3: Lint guardrail — `core/` must not import `electron`

**Files:** Modify `electron/.eslintrc.cjs`

- [ ] **Step 1:** Add `no-restricted-imports` (or `import/no-restricted-paths`) banning `electron` and `node:*` OS modules inside `src/core/**`, so pure logic stays pure and unit-testable.
- [ ] **Step 2:** Run `npm run lint` → PASS.
- [ ] **Step 3:** Commit: `git commit -am "chore(lint): keep core pure"`.

---

## Phase 2 — Pure-logic core (TDD, no Electron)

These have no OS dependency. Council #2: keep them out of the main process so they test fast. **Each follows strict TDD: write failing test from C# behavior → run red → implement → run green → commit.** Port the existing 31 C# test files' assertions as the TS test cases.

Order (lowest-dependency first): `argumentEscaper` → `fuzzyMatcher` → `relativeTimeFormatter` → `projectNameValidator` → `deepLinkBuilder`/`deepLinkParser` → `projectFilter` → `projectSearch` → `mruList` → `settingsJsonValidator` → `flagCatalog`/`flagsEditor` → `envFileEditor` → `mcpConfigReader` → `launchCommandBuilder` (per-OS string build) → `profileComposer`/`shellMenuComposer` → `gitOutputParser` → `sessionStaleness`/`sessionSummary`/`sessionEndDetector` → `projectDescription`/`projectClaudeInfo`/`projectModelInfo`.

### Task 2.1 (template — repeat per module): `argumentEscaper.ts`

**Files:**
- Create: `electron/src/core/launch/argumentEscaper.ts`
- Test: `electron/tests/core/argumentEscaper.test.ts`

- [ ] **Step 1: Write failing tests** mirroring `ArgumentEscaper.cs` behavior, including injection-style inputs:
```ts
import { escapeArg } from '../../src/core/launch/argumentEscaper'
test('quotes spaces', () => expect(escapeArg('a b')).toBe('"a b"'))
test('neutralizes quote injection', () => {
  expect(escapeArg('"; rm -rf ~ #')).not.toContain('; rm')
})
// ...port each ArgumentEscaper.cs test case
```
- [ ] **Step 2: Run red:** `npx vitest run tests/core/argumentEscaper.test.ts` → FAIL (not implemented).
- [ ] **Step 3: Implement** `escapeArg` to match C# output for every case.
- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit:** `git commit -am "feat(core): port argumentEscaper with tests"`.

> Repeat Task 2.1's five-step shape for every module in the order above. For each: read the C# source + its test file, port the test cases verbatim as TS, then implement to green. Do not batch — one module, one commit.

### Task 2.last: `configService.ts` with byte-parity writer

**Files:** Create `electron/src/core/config/configService.ts`, `electron/tests/core/configService.test.ts`

- [ ] **Step 1:** Write tests asserting (a) parse of the real fixtures from Task 0.5, (b) **round-trip byte-equality** using the serialization rule recorded in `FINDINGS.md`, (c) atomic write via temp+rename, (d) graceful handling of BOM / invalid UTF-8 (throw typed error, never silent-corrupt).
- [ ] **Step 2:** Run red.
- [ ] **Step 3:** Implement `readConfig`, `writeConfigAtomic`, using `~/.claude` paths from `appPaths.ts`. Pure file logic stays here; the temp+rename uses `node:fs` so this one module is allowed `node:fs` (carve-out in lint, or split the fs call into `main/`). **Decision:** put the raw fs call in `main/os/atomicFile.ts` and keep `configService.ts` pure (takes/returns strings); `main` wires them. Update tests accordingly.
- [ ] **Step 4:** Run green.
- [ ] **Step 5:** Commit.

---

## Phase 3 — OS integration (Mac-first, built on Phase 0 findings)

Council #7: build the riskiest OS pieces before UI. Each has a `.win.ts` and `.mac.ts` selected by `process.platform`, behind a shared interface in `main/os/index.ts`. Test on **both** OSes.

### Task 3.1: `atomicFile.ts` + file watch

- [ ] **Step 1:** Implement `writeFileAtomic(path, contents)` (temp in same dir + `fs.rename`). Test: interrupted write leaves original intact.
- [ ] **Step 2:** Implement `watch(paths, cb)` with chokidar; debounce. Test it fires on a real file change.
- [ ] **Step 3:** Commit.

### Task 3.2: `processInspector.{win,mac}.ts`

- [ ] **Step 1:** Define interface `listProcesses(): Promise<ProcEntry[]>` and `findClaudeSessions(): Promise<RunningSession[]>` (`ProcEntry` = pid, ppid, command, started).
- [ ] **Step 2:** Implement `.mac.ts` using the exact command + parse rule from Task 0.2. Implement `.win.ts` using `tasklist`/`wmic` or `ps-list` (no P/Invoke). Map both to the same `RunningSession` model.
- [ ] **Step 3:** Test parse with captured stdout fixtures from both OSes (pure parse lives in `core/`, spawn lives in `main/`).
- [ ] **Step 4:** Commit.

### Task 3.3: `sessionKiller.{win,mac}.ts`

- [ ] **Step 1:** Implement Mac kill using the SIGTERM→SIGKILL + process-group strategy from Task 0.3; Win using `taskkill /T` (tree).
- [ ] **Step 2:** Integration test: launch a dummy long-running process, kill it, assert gone + no orphan.
- [ ] **Step 3:** Commit.

### Task 3.4: `terminalLauncher.{win,mac}.ts` + `commandLocator`

- [ ] **Step 1:** Implement Mac: detect installed terminals (Terminal.app always, iTerm if present), launch via osascript from Task 0.4, cwd+command from `launchCommandBuilder`. Win: locate `wt.exe`/`pwsh` (port `CommandLocator.cs` logic) and launch.
- [ ] **Step 2:** All command construction goes through `argumentEscaper`; `spawn` with `shell:false`. Add a test asserting a malicious project name cannot inject (`"; rm -rf ~`).
- [ ] **Step 3:** Manual e2e: launch real `claude` on each OS, confirm TTY + cwd + env.
- [ ] **Step 4:** Commit.

### Task 3.5: `gitRunner.ts`

- [ ] **Step 1:** Spawn `git` for status/branch/worktree-list; pipe stdout to `core/git/gitOutputParser.ts`. Normalize path separators + line endings.
- [ ] **Step 2:** Test parser against fixtures captured from a real repo on both OSes.
- [ ] **Step 3:** Commit.

### Task 3.6: Wire IPC handlers in main

- [ ] **Step 1:** Register a handler per `IPC` channel calling the right `core`/`os` function. Validate every inbound payload (reject unexpected shapes) — IPC is a trust boundary.
- [ ] **Step 2:** Expose the typed `invoke` surface through `preload.ts` contextBridge only (no raw `ipcRenderer`).
- [ ] **Step 3:** Smoke test: from devtools, call each channel, confirm round-trip.
- [ ] **Step 4:** Commit.

---

## Phase 4 — Renderer UI (React)

Build main window first end-to-end (proves IPC + real data), then dialogs. Council #5: dialogs are real work — use a single accessible modal primitive (focus trap, Esc, parent dimming) reused by all 13, not native message boxes.

### Task 4.1: App shell + main window

- [ ] **Step 1:** Tailwind theme tokens matching current Light/Dark/HighContrast palettes (port `Theming/Palettes.cs`, `Accents.cs`, `Appearance.cs` values to CSS variables). Honor `nativeTheme` for OS dark mode.
- [ ] **Step 2:** Build the project list view bound to `projects:scan` + `sessions:list` over IPC. Loading/empty/error states.
- [ ] **Step 3:** Commit.

### Task 4.2: Reusable `<Modal>` primitive + command palette

- [ ] **Step 1:** Build `<Modal>` (focus trap, Esc close, backdrop, returns a value). Test keyboard a11y.
- [ ] **Step 2:** Build `CommandPalette` (fuzzy over `core/fuzzyMatcher`) — high-value, exercises the modal + core wiring.
- [ ] **Step 3:** Commit.

### Task 4.3 (template — repeat per dialog): port one dialog

For each of the remaining 12 dialogs (`NewProject`, `RenameProject`, `DeleteProject`, `EnvEditor`, `GroupManager`, `McpViewer`, `ProfileManager`, `QuickPrompt`, `ResumeSession`, `SavedFilter`, `Settings`, `WorktreePicker`):
- [ ] **Step 1:** Read the `.xaml` + `.xaml.cs`, list its inputs/outputs and which IPC channels/core functions it needs.
- [ ] **Step 2:** Build the React component using `<Modal>`; wire to IPC.
- [ ] **Step 3:** Manual check: open, interact, confirm parity with screenshots of the old app.
- [ ] **Step 4:** Commit (one dialog per commit).

---

## Phase 5 — Tray, hotkey, protocol, single-instance

### Task 5.1: Single-instance + ccmc:// protocol

- [ ] **Step 1:** `app.requestSingleInstanceLock()`; on `second-instance`, route the passed `ccmc://` URL to the running window (parse via `core/deepLinkParser`).
- [ ] **Step 2:** `app.setAsDefaultProtocolClient('ccmc')`. Handle `open-url` (mac, including cold launch — buffer the URL until the window is ready) and Windows `argv` parsing.
- [ ] **Step 3:** Configure `build/` so electron-builder writes the macOS `Info.plist` `CFBundleURLTypes` for `ccmc` (builder will NOT add this automatically) and the Windows registry protocol.
- [ ] **Step 4:** Manual e2e: click a `ccmc://` link cold and warm on both OSes.
- [ ] **Step 5:** Commit.

### Task 5.2: Tray / menu-bar extra

- [ ] **Step 1:** `tray.win.ts`: notification-area icon + context menu. `tray.mac.ts`: menu-bar extra with a **template** image (monochrome) so it themes correctly.
- [ ] **Step 2:** Commit.

### Task 5.3: Global hotkey with permission handling

- [ ] **Step 1:** Register via `globalShortcut`. On macOS, registration can silently fail without Accessibility permission — detect failure and surface a toast linking to System Settings › Privacy › Accessibility.
- [ ] **Step 2:** Commit.

### Task 5.4: Windows jump list (Win-only), Mac Dock menu

- [ ] **Step 1:** Port `JumpListService.cs` to `jumpList.win.ts`. On Mac provide a Dock menu equivalent or no-op.
- [ ] **Step 2:** Commit.

---

## Phase 6 — Packaging, signing, notarization

Council #9: this eats days; budget for it. Do Windows and macOS separately.

### Task 6.1: electron-builder base config

- [ ] **Step 1:** Add `electron-builder` config: appId, Win `nsis`, Mac `dmg`, icons, `Info.plist` URL types, file associations.
- [ ] **Step 2:** Produce an unsigned build on each OS; confirm it launches.
- [ ] **Step 3:** Commit.

### Task 6.2: Windows signing

- [ ] **Step 1:** Wire code-signing cert; produce signed NSIS installer; verify SmartScreen behavior.
- [ ] **Step 2:** Commit.

### Task 6.3: macOS hardened runtime + notarization

- [ ] **Step 1:** Add `build/entitlements.mac.plist` (hardened runtime; add only entitlements actually needed — e.g. inherit/JIT only if required). Enable `hardenedRuntime`, `gatekeeperAssess:false`.
- [ ] **Step 2:** Configure notarization (Apple ID/app-specific password or API key) in the builder afterSign hook.
- [ ] **Step 3:** Build signed+notarized dmg; staple; verify Gatekeeper passes on a clean Mac (`spctl -a -vv`).
- [ ] **Step 4:** Commit.

---

## Phase 7 — Parity verification + cutover

### Task 7.1: Behavior parity checklist

- [ ] **Step 1:** Walk every feature in the Source-of-Truth Map against the old app on Windows; fix gaps. Repeat on macOS.
- [ ] **Step 2:** Confirm `~/.claude` files written by the Electron app are accepted by the real Claude CLI (round-trip live, not just fixtures).
- [ ] **Step 3:** Commit fixes.

### Task 7.2: Retire legacy

- [ ] **Step 1:** Move `src/Ccmc.WinUI` + `src/Ccmc.Core` to `legacy/` (keep history); update README, launcher, publish scripts to the Electron build.
- [ ] **Step 2:** Final commit + tag.

---

## Risk register (from council)

| Risk | Mitigation | Where |
|---|---|---|
| Mac process detect/kill unreliable | Spike first; `ps -axww`/lsof + process-group kill | 0.2, 0.3, 3.2, 3.3 |
| Terminal launch (AppleScript, TTY, env) | Spike both terminals; osascript strategy | 0.4, 3.4 |
| JSON not byte-parity → CLI breaks | Byte-diff spike; atomic temp+rename; pin serializer | 0.5, 2.last, 3.1 |
| Command injection via project/env names | `argumentEscaper` + `spawn shell:false` + array args | 2.1, 3.4 |
| Concurrent ~/.claude writes (CLI + app) | Atomic write + read-retry | 3.1 |
| globalShortcut silent-fails on Mac | Runtime detect + Accessibility prompt | 5.3 |
| ccmc:// cold launch / single-instance routing | requestSingleInstanceLock + open-url buffering + Info.plist | 5.1 |
| Tray UX differs on Mac | template icon + menu-bar design | 5.2 |
| Notarization/entitlements | dedicated phase, clean-Mac verification | 6.3 |
| 13 dialogs underestimated | shared `<Modal>` primitive, one-per-commit | 4.2, 4.3 |
| Putting all logic in main (untestable) | pure `core/` + lint guardrail | 1.3, Phase 2 |
| Playwright+Electron flaky | vitest for logic; manual e2e for platform paths | throughout |
```