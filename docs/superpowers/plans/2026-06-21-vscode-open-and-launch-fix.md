# VS Code Open Fix + VS Code Launch Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken "Open in VS Code" action and add "VS Code" as a selectable default launch target (alongside `wt`/`wtai`) that opens the project in VS Code and starts a Claude Code extension session.

**Architecture:** A small pure module (`core/launch/vscodeLaunch.ts`) holds the testable bits (resolve `Code.exe` from the `code` CLI path, build the extension URI, parse the installed-extension list). The Electron boundary (`register.ts`) spawns the real GUI exe and fires the URI; the pure handler map (`handlers.ts`) gains a `launchVscode` dependency and special-cases the `vscode` terminal id. No IPC contract change — the Settings dropdown auto-populates from `terminals:detect`.

**Tech Stack:** Electron 32 (Node 20), React 18, TypeScript (strict), Vitest.

## Root causes (investigated + confirmed)

- **#1 "Open in VS Code" fails:** `code` resolves to `code.cmd` (a batch file). `register.ts` does `spawn(codePath, [filePath], { shell: false })`, and Node throws `EINVAL` **synchronously** when spawning a `.cmd`/`.bat` with `shell:false` (the post-CVE-2024-27980 guard). The synchronous throw escapes the `child.on('error')` handler (which only catches async errors), so the promise rejects and the action silently fails. **Reproduced:** `spawn('…\\code.cmd', ['--version'], {shell:false})` → `Error: spawn EINVAL`.
- **#2 VS Code missing from the default-terminal selector:** the Settings dropdown is populated by `terminals:detect`, which only emits entries from the `WINDOWS_TERMINAL_EXE` map (`wt`, `wtai`). There is no VS Code entry, and the launch path (`buildLaunchSpec` → spawn one terminal running `claude`) has no notion of "open in VS Code".

## Verified facts

- `Code.exe` (the GUI exe) sits at the **grandparent** of `code.cmd`: `<root>\bin\code.cmd` → `<root>\Code.exe`. Confirmed on this machine at `C:\Users\peter\AppData\Local\Programs\Microsoft VS Code\Code.exe`. `Code.exe <folder>` opens the folder. Spawning `Code.exe` (a real exe) does not hit the `.cmd` EINVAL.
- `Code.exe --version` does **not** run in CLI mode (it starts the GUI). So CLI operations (`--list-extensions`, `--install-extension`) MUST go through the `code` CLI, which is spawnable as `cmd.exe /c code <args>` (cmd.exe is a real exe; it runs the batch). Fixed args = no injection.
- The official extension id is `anthropic.claude-code` (confirmed installed on this machine via `code --list-extensions`).
- The extension registers a URI handler `vscode://anthropic.claude-code/open` (optional `?prompt=<url-encoded>`); it opens a Claude Code tab in the **focused** VS Code window. It carries **no** folder param, so the folder must be opened first. Fired via Electron `shell.openExternal`.
- `ICommandLocator.findOnPath(command)` exists and is used in `register.ts` (`deps.commandLocator.findOnPath('code')`).

## User decisions (locked)

- Launch flow: **open folder, then fire the extension URI after a ~1.5s delay** (with the project's `initialPrompt` if set).
- Missing extension: **auto-install** (`code --install-extension anthropic.claude-code --force`) before firing the URI — but only when not already installed (keeps the common case fast).
- VS Code launch target is **Windows-only** (the `Code.exe` derivation + the existing terminal selector are win32-only).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `electron/src/core/launch/vscodeLaunch.ts` | Pure: `vscodeAppExeFromCli`, `buildVscodeOpenUri`, `isExtensionInstalled`, `CLAUDE_CODE_EXTENSION_ID` | Create |
| `electron/tests/core/launch/vscodeLaunch.test.ts` | Pure helper tests | Create |
| `electron/src/main/ipc/register.ts` | Fix `openInVscode` (spawn `Code.exe`); add `launchVscode` impl | Modify |
| `electron/src/main/ipc/handlers.ts` | `IpcHandlerDeps.launchVscode`; `resolveSelectedTerminal` + `terminals:detect` + `launch:run` vscode branch | Modify |
| `electron/tests/main/ipc/handlers.test.ts` | Tests for the vscode detect + launch branch | Modify |

---

## Task 1: Pure VS Code launch helpers

**Files:**
- Create: `electron/src/core/launch/vscodeLaunch.ts`
- Test: `electron/tests/core/launch/vscodeLaunch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  vscodeAppExeFromCli,
  buildVscodeOpenUri,
  isExtensionInstalled,
  CLAUDE_CODE_EXTENSION_ID,
} from '../../../src/core/launch/vscodeLaunch'

describe('vscodeAppExeFromCli', () => {
  it('derives Code.exe from the bin\\code.cmd CLI path (user install)', () => {
    const cli = 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd'
    expect(vscodeAppExeFromCli(cli)).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe')
  })

  it('derives Code.exe for a system install', () => {
    const cli = 'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
    expect(vscodeAppExeFromCli(cli)).toBe('C:\\Program Files\\Microsoft VS Code\\Code.exe')
  })
})

describe('buildVscodeOpenUri', () => {
  it('returns the bare open URI when no prompt', () => {
    expect(buildVscodeOpenUri()).toBe(`vscode://${CLAUDE_CODE_EXTENSION_ID}/open`)
    expect(buildVscodeOpenUri(null)).toBe(`vscode://${CLAUDE_CODE_EXTENSION_ID}/open`)
    expect(buildVscodeOpenUri('   ')).toBe(`vscode://${CLAUDE_CODE_EXTENSION_ID}/open`)
  })

  it('url-encodes a prompt into the query', () => {
    expect(buildVscodeOpenUri('review my changes')).toBe(
      `vscode://${CLAUDE_CODE_EXTENSION_ID}/open?prompt=review%20my%20changes`,
    )
  })
})

describe('isExtensionInstalled', () => {
  it('matches an installed extension id case-insensitively', () => {
    const list = 'bierner.markdown-mermaid\nAnthropic.Claude-Code\njpantsjoha.c4x\n'
    expect(isExtensionInstalled(list, 'anthropic.claude-code')).toBe(true)
  })

  it('returns false when absent', () => {
    expect(isExtensionInstalled('foo.bar\nbaz.qux', 'anthropic.claude-code')).toBe(false)
    expect(isExtensionInstalled('', 'anthropic.claude-code')).toBe(false)
  })
})

describe('CLAUDE_CODE_EXTENSION_ID', () => {
  it('is the official id', () => {
    expect(CLAUDE_CODE_EXTENSION_ID).toBe('anthropic.claude-code')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/launch/vscodeLaunch.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Pure helpers for the VS Code launch path. No electron/fs/child_process — the
 * impure spawn + shell.openExternal live in register.ts.
 */
import * as path from 'node:path'

/** The official Claude Code VS Code extension id. */
export const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code'

/**
 * Derives the VS Code GUI executable (Code.exe) from the resolved `code` CLI
 * path. The CLI lives at `<root>\bin\code.cmd`; the GUI exe is `<root>\Code.exe`.
 * Spawning Code.exe (a real exe) avoids the `.cmd` EINVAL that breaks
 * `spawn(code.cmd, …, { shell:false })`. Uses win32 path semantics — this path
 * is only taken on Windows.
 */
export function vscodeAppExeFromCli(cliPath: string): string {
  return path.win32.join(path.win32.dirname(path.win32.dirname(cliPath)), 'Code.exe')
}

/**
 * Builds the Claude Code extension URI that opens a Claude tab in the focused
 * VS Code window. Adds a url-encoded `prompt` when a non-blank prompt is given.
 */
export function buildVscodeOpenUri(initialPrompt?: string | null): string {
  const base = `vscode://${CLAUDE_CODE_EXTENSION_ID}/open`
  if (initialPrompt && initialPrompt.trim().length > 0) {
    return `${base}?prompt=${encodeURIComponent(initialPrompt)}`
  }
  return base
}

/**
 * Parses `code --list-extensions` output (one id per line) and reports whether
 * `id` is present (case-insensitive).
 */
export function isExtensionInstalled(listOutput: string, id: string): boolean {
  const wanted = id.toLowerCase()
  return listOutput
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .includes(wanted)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/launch/vscodeLaunch.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/launch/vscodeLaunch.ts electron/tests/core/launch/vscodeLaunch.test.ts
git commit -m "feat(core): add pure VS Code launch helpers"
```

---

## Task 2: Fix "Open in VS Code" (spawn Code.exe, not code.cmd)

**Files:**
- Modify: `electron/src/main/ipc/register.ts`

- [ ] **Step 1: Read the current `openInVscode`**

READ `electron/src/main/ipc/register.ts`. The current `openInVscode` resolves `code` (→ `code.cmd`) and does `spawn(codePath, [filePath], { shell:false, detached:true, stdio:'ignore' })` — this throws `EINVAL` synchronously on a `.cmd`.

- [ ] **Step 2: Add the import**

At the top of `register.ts`, after the existing imports, add:

```ts
import { vscodeAppExeFromCli } from '../../core/launch/vscodeLaunch'
```

- [ ] **Step 3: Replace `openInVscode`**

Replace the existing `openInVscode` implementation with one that resolves `Code.exe` and spawns the real exe (a `.cmd` is never spawned). Keep the same `IpcHandlerDeps['openInVscode']` shape:

```ts
  // Wire shell:openInVscode — resolve the `code` CLI, derive the GUI exe, spawn it.
  // We spawn Code.exe (a real exe) rather than the resolved `code.cmd`, because
  // spawn(*.cmd, { shell:false }) throws EINVAL on modern Node.
  const openInVscode: IpcHandlerDeps['openInVscode'] = async (filePath) => {
    const codeCli = await deps.commandLocator.findOnPath('code')
    if (codeCli === null) {
      return { ok: false, error: 'VS Code CLI (code) not found on PATH. Install VS Code and ensure the "code" command is available.' }
    }
    const exe = vscodeAppExeFromCli(codeCli)
    return new Promise((resolve) => {
      let settled = false
      const done = (r: { ok: boolean; error?: string }): void => {
        if (!settled) { settled = true; resolve(r) }
      }
      try {
        const child = spawn(exe, [filePath], { shell: false, detached: true, stdio: 'ignore' })
        child.on('error', (err) => done({ ok: false, error: err.message }))
        child.unref()
        if (child.pid !== undefined) done({ ok: true })
      } catch (err) {
        done({ ok: false, error: (err as Error).message })
      }
    })
  }
```

- [ ] **Step 4: Verify compile + tests**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS (existing suite stays green; `register.ts` is not unit-tested).

- [ ] **Step 5: Commit**

```bash
git add electron/src/main/ipc/register.ts
git commit -m "fix(main): open VS Code via Code.exe (code.cmd spawn threw EINVAL)"
```

---

## Task 3: VS Code launch target — backend wiring

**Files:**
- Modify: `electron/src/main/ipc/handlers.ts`
- Modify: `electron/src/main/ipc/register.ts`

- [ ] **Step 1: Add `launchVscode` to `IpcHandlerDeps` (`handlers.ts`)**

READ `handlers.ts`. In the `IpcHandlerDeps` interface, after the `openInVscode` field, add:

```ts
  /**
   * Injected from register.ts — opens the project in VS Code and starts a
   * Claude Code extension session (open folder, ensure extension, fire URI).
   */
  launchVscode: (projectPath: string, initialPrompt: string | null) => Promise<{ ok: boolean; error?: string }>
```

- [ ] **Step 2: Teach `resolveSelectedTerminal` about `vscode` (`handlers.ts`)**

In `handlers.ts`, the `resolveSelectedTerminal` function currently looks the id up in `WINDOWS_TERMINAL_EXE`. Add a `vscode` branch before that lookup. Replace the body after the `if (!terminalId) return null` line with:

```ts
    if (!terminalId) return null
    if (terminalId === 'vscode') {
      const code = await commandLocator.findOnPath('code')
      return code !== null ? { id: 'vscode', path: code } : null
    }
    const exe = WINDOWS_TERMINAL_EXE[terminalId]
    if (!exe) return null
    const resolved = await commandLocator.findTerminalPath(exe)
    return resolved !== null ? { id: terminalId, path: resolved } : null
```

- [ ] **Step 3: Branch `launch:run` for `vscode` (`handlers.ts`)**

In the `launch:run` handler, replace the block from `const selectedTerminal = await resolveSelectedTerminal()` through the `const spec = buildLaunchSpec({...})` / `const result = await terminalLauncher.launch(spec)` with a version that intercepts `vscode` before the terminal-spawn path:

```ts
      const selectedTerminal = await resolveSelectedTerminal()

      // VS Code is not a terminal-spawn: open the folder + start a Claude Code
      // extension session instead of running claude in a shell.
      if (selectedTerminal?.id === 'vscode') {
        const vsResult = await launchVscode(projectPath, initialPrompt)
        if (vsResult.ok && obj['recordUsage'] !== false) {
          await recordLaunchUsage(projectPath)
        }
        return {
          ok: vsResult.ok,
          error: vsResult.ok ? undefined : vsResult.error ?? 'Launch failed',
        }
      }

      const spec = buildLaunchSpec({
        projectName,
        projectPath,
        flags,
        continueSession,
        shell,
        wtPath,
        initialPrompt,
        terminal: selectedTerminal,
      })

      const result = await terminalLauncher.launch(spec)
```

(`launchVscode` is destructured from deps — ensure it is in scope. The `createHandlers` function destructures deps at the top; add `launchVscode` to that destructure alongside `openInVscode`, `openPath`, etc. READ how the other injected deps like `openInVscode` are brought into scope and mirror it.)

- [ ] **Step 4: Add `vscode` to `terminals:detect` (`handlers.ts`)**

In the `terminals:detect` handler, after the `for (const t of terminalsForPlatform(platform))` loop that fills `detected`, add a Windows-only VS Code entry:

```ts
      // VS Code is offered as a launch target on Windows when the `code` CLI
      // resolves. It opens the project + starts a Claude Code extension session.
      if (platform === 'win32') {
        const code = await commandLocator.findOnPath('code')
        if (code !== null) {
          detected.push({ id: 'vscode', name: 'VS Code (Claude Code)', path: code })
        }
      }

      return detected
```

(Replace the existing `return detected` with the block above.)

- [ ] **Step 5: Implement `launchVscode` in `register.ts`**

READ `register.ts` — note `spawn` is imported from `node:child_process`, `electronShell` is a parameter, and `deps.commandLocator` is available. Add the import for the helpers (extend the Task 2 import line):

```ts
import { vscodeAppExeFromCli, buildVscodeOpenUri, isExtensionInstalled, CLAUDE_CODE_EXTENSION_ID } from '../../core/launch/vscodeLaunch'
```

Add a `runCodeCli` helper and the `launchVscode` implementation inside `registerIpc` (near `openInVscode`), then pass `launchVscode` into `createHandlers`:

```ts
  // Runs a `code` CLI op via cmd.exe (`code` is code.cmd, which can't be spawned
  // with shell:false directly). Fixed args only — no shell injection. Resolves
  // captured stdout; rejects on spawn error.
  function runCodeCli(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('cmd.exe', ['/c', 'code', ...args], { shell: false, windowsHide: true })
      let out = ''
      child.stdout?.on('data', (d: Buffer) => { out += d.toString() })
      child.on('error', reject)
      child.on('close', () => resolve(out))
    })
  }

  // Wire launch:run's VS Code target — open the folder in VS Code, ensure the
  // Claude Code extension is installed, then fire the extension URI (delayed so
  // the window is focused). initialPrompt pre-fills the Claude prompt box.
  const launchVscode: IpcHandlerDeps['launchVscode'] = async (projectPath, initialPrompt) => {
    const codeCli = await deps.commandLocator.findOnPath('code')
    if (codeCli === null) {
      return { ok: false, error: 'VS Code CLI (code) not found on PATH. Install VS Code and ensure the "code" command is available.' }
    }
    const exe = vscodeAppExeFromCli(codeCli)

    // Ensure the Claude Code extension is present (only install when missing).
    // Non-fatal: if the check/install fails we still open the folder.
    try {
      const list = await runCodeCli(['--list-extensions'])
      if (!isExtensionInstalled(list, CLAUDE_CODE_EXTENSION_ID)) {
        await runCodeCli(['--install-extension', CLAUDE_CODE_EXTENSION_ID, '--force'])
      }
    } catch {
      // continue — opening the folder is still useful
    }

    // Open the project folder in VS Code.
    try {
      const child = spawn(exe, [projectPath], { shell: false, detached: true, stdio: 'ignore' })
      child.unref()
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }

    // After a short delay (so the new window is focused), open a Claude Code tab.
    const uri = buildVscodeOpenUri(initialPrompt)
    setTimeout(() => { void electronShell.openExternal(uri) }, 1500)

    return { ok: true }
  }

  const handlers = createHandlers({ ...deps, pickFolder, openPath, openInVscode, launchVscode })
```

(Replace the existing `const handlers = createHandlers({ ...deps, pickFolder, openPath, openInVscode })` line with the one above that also passes `launchVscode`.)

- [ ] **Step 6: Verify compile + tests**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: `tsc` may FAIL in `handlers.test.ts` because the test's `createHandlers(...)` deps object now lacks `launchVscode`. Task 4 fixes the test. If the non-test code compiles otherwise, proceed. (If you want a clean intermediate, you may add a stub `launchVscode: async () => ({ ok: true })` to the test deps now and flesh it out in Task 4.)

- [ ] **Step 7: Commit**

```bash
git add electron/src/main/ipc/handlers.ts electron/src/main/ipc/register.ts
git commit -m "feat(main): add VS Code launch target (open folder + Claude Code session)"
```

---

## Task 4: Tests for the VS Code launch target

**Files:**
- Modify: `electron/tests/main/ipc/handlers.test.ts`

- [ ] **Step 1: Read the existing harness**

READ `handlers.test.ts`. Find: (a) how the fake `commandLocator` is built (it must implement `findOnPath`, `findTerminalPath`, `findWindowsTerminal`, `getPreferredShell`), (b) how the fake `terminalLauncher` records `launch` calls, (c) how `state` is seeded for `terminals:detect`/`launch:run` (temp `statePath` written with `terminalId`), and (d) how `createHandlers(deps)` is constructed. Add a `launchVscode` field to the deps the harness builds — a spy like `const launchVscodeSpy = vi.fn(async () => ({ ok: true }))`.

- [ ] **Step 2: Add the tests**

Add a `describe` block. Adjust the fake `commandLocator.findOnPath` so it returns a `code` path when asked (e.g. `findOnPath: vi.fn(async (c: string) => (c === 'code' ? 'C:\\\\VS\\\\bin\\\\code.cmd' : null))`), matching the harness's existing locator shape:

```ts
describe('VS Code launch target', () => {
  it('terminals:detect includes vscode (win32) when the code CLI resolves', async () => {
    // build handlers with a commandLocator whose findOnPath('code') returns a path
    // (see harness). On win32:
    const detected = await handlers['terminals:detect']()
    expect(detected.some((t) => t.id === 'vscode' && t.name === 'VS Code (Claude Code)')).toBe(true)
  })

  it('launch:run routes to launchVscode when terminalId is vscode (not the terminal launcher)', async () => {
    // seed state.terminalId = 'vscode' (write the temp state file the harness uses)
    const res = await handlers['launch:run']({
      projectName: 'demo',
      projectPath: 'C:\\\\Dev\\\\demo',
      continueSession: false,
      initialPrompt: '/review',
    })
    expect(res.ok).toBe(true)
    expect(launchVscodeSpy).toHaveBeenCalledWith('C:\\\\Dev\\\\demo', '/review')
    expect(terminalLauncherSpy.launch).not.toHaveBeenCalled()
  })
})
```

Adapt the variable names (`handlers`, `launchVscodeSpy`, `terminalLauncherSpy`) to whatever the harness actually exposes. The two assertions that matter: (1) `vscode` appears in `terminals:detect` output when `findOnPath('code')` resolves on win32; (2) with `state.terminalId === 'vscode'`, `launch:run` calls the injected `launchVscode` with `(projectPath, initialPrompt)` and does NOT call `terminalLauncher.launch`.

NOTE: these tests only run meaningfully on win32 (the detect branch is win32-gated and `resolveSelectedTerminal` returns null off-win32). The CI/dev machine here is Windows. If the harness runs cross-platform, guard the win32-specific assertions with `if (process.platform === 'win32')` and assert the off-win32 fallback otherwise — do not force win32 behavior on a non-win32 runner.

- [ ] **Step 3: Verify compile + full suite**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS, all green. Report the new test count.

- [ ] **Step 4: Commit**

```bash
git add electron/tests/main/ipc/handlers.test.ts
git commit -m "test(main): cover VS Code detect + launch routing"
```

---

## Task 5: Manual verification in the running app

**Files:** none (verification only)

Per the memory rule (*unit-green ≠ working; launch the app and read main-process logs*):

- [ ] **Step 1: Build + boot**

Run: `cd electron && npm run dev`. Confirm clean main-process startup (no errors). (If a prior instance holds the single-instance lock, kill stray `electron.exe` under this project path first.)

- [ ] **Step 2: Verify #1 — Open in VS Code**

Right-click any project → "Open in VS Code". Confirm VS Code **opens the folder** (previously silently failed). Check the dev console for no `shell:openInVscode` error.

- [ ] **Step 3: Verify #2 — VS Code launch target**

- Open Settings. Confirm the "Terminal" dropdown now lists **"VS Code (Claude Code)"** alongside Windows Terminal / Windows Terminal AI. Select it and save.
- Launch a project (Enter / "New"). Confirm: VS Code opens the folder, and ~1.5s later a **Claude Code tab** opens in that window (the extension URI fired). If a quick-prompt/initial prompt was set, confirm it pre-fills the Claude prompt box.
- Temporarily check the missing-extension path is non-fatal: it should still open the folder even if the extension list/install step errors (don't uninstall the extension — just confirm the open happens).

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "fix: address VS Code launch manual-verification findings"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- #1 "Open in VS Code" fix → Task 2 (spawn `Code.exe` via pure `vscodeAppExeFromCli`). Root cause (`.cmd` EINVAL) addressed at source. ✅
- #2 VS Code as default launch target → Task 3 (detect in `terminals:detect`, resolve in `resolveSelectedTerminal`, branch in `launch:run`, impl `launchVscode` in register). Surfaces in the Settings dropdown with no IPC change. ✅
- Launch flow = open folder + delayed URI with prompt → Task 3 Step 5 (`spawn Code.exe`, `setTimeout(…1500)`, `buildVscodeOpenUri(initialPrompt)`). ✅
- Auto-install when missing → Task 3 Step 5 (`runCodeCli(['--list-extensions'])` → conditional `--install-extension … --force`). ✅
- Windows-only → win32 gate in `terminals:detect`; `resolveSelectedTerminal` already returns null off-win32. ✅
- Tests → Task 1 (pure helpers), Task 4 (detect + launch routing). ✅

**Placeholder scan:** No TBD/TODO. The only adapt-to-harness instruction (Task 4) is unavoidable — the test must match the existing fake-deps shape; the required assertions are spelled out concretely.

**Type consistency:** `launchVscode: (projectPath: string, initialPrompt: string | null) => Promise<{ ok: boolean; error?: string }>` consistent across the `IpcHandlerDeps` interface (handlers.ts), the register.ts impl, the launch:run call site, and the test spy. Helper names `vscodeAppExeFromCli` / `buildVscodeOpenUri` / `isExtensionInstalled` / `CLAUDE_CODE_EXTENSION_ID` consistent across core, register, and tests. `id: 'vscode'` string consistent across detect, resolve, and the launch branch.

**Security note:** `runCodeCli` spawns `cmd.exe /c code` with **fixed** args (`--list-extensions`, `--install-extension`, the constant extension id) — no user input reaches the command line. The folder open spawns `Code.exe` with the project path as a single array arg (`shell:false`, no shell interpolation). The URI is built from a constant base + a url-encoded prompt. No injection surface introduced.

**Known limitation:** `vscodeAppExeFromCli` assumes the standard `<root>\bin\code.cmd` → `<root>\Code.exe` layout (covers user + system installs). VS Code **Insiders** (`Code - Insiders.exe`) is not handled — acceptable; stable VS Code is the target. The folder-open→URI timing is inherently best-effort (the URI opens in the focused window); 1.5s is the chosen delay.
