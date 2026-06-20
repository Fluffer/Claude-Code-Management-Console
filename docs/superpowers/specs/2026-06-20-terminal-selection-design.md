# Terminal selection — design

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation
**Area:** electron app — session launch / terminals
**Reviewed by:** council (DeepSeek-V4 Pro, GLM-5.1, Qwen3-Coder) — corrections folded in below.

## Problem

Claude sessions always open in Windows Terminal (`wt.exe`) when present, else a
bare shell. Users want to **choose** which terminal a session opens in. The dev
machine has both `wt.exe` (Windows Terminal) and `wtai.exe` (a Windows Terminal
variant). The design must also be **prepared** for selecting among macOS
terminals later (Terminal.app, iTerm2, Warp, Ghostty) without implementing them
now.

This is net-new (beyond WinUI parity).

## Decisions (from brainstorming + council)

- **Scope:** global default only for v1. No per-project override (the strategy
  takes a terminal id as a parameter, so per-project later is not a refactor).
- **Raw shell:** fallback only — never a dropdown entry. Used when the selected
  terminal is missing at launch.
- **Dropdown contents:** only terminals that are **available AND match the
  current OS** (Windows terminals on Windows, mac terminals on mac).
- **Preference read point:** main reads the selected terminal from `state.json`
  inside `launch:run` (already loads state there for usage recording), so the
  many launch call-sites (row buttons, palette, quick-prompt, resume) need no
  changes.

## Council corrections incorporated

1. **Path plumbing.** A pure `buildSpec` cannot discover `wt.exe`/`wtai.exe`
   paths. Main resolves the terminal's executable path (impure) and passes it
   **into** the strategy. Strategy signature includes `terminalPath`.
2. **Escaping is shell-specific, not terminal-specific.** `buildClaudeCommand`
   is PowerShell-specific (single-quote `-Command`). The macOS strategies will
   target bash/zsh and need POSIX quoting. The strategy owns final command
   assembly; the POSIX-escaping contract is documented now even though mac stays
   a stub.
3. **`wtai` is not assumed wt-compatible.** It is its own registry entry that may
   reuse the wt arg-builder but can diverge. To be validated against the real
   `wtai.exe` during implementation.
4. **Pure/impure boundary.** Main resolves `{terminalId, terminalPath, shell}`
   (impure); pure `buildLaunchSpec` looks up the pure registry strategy. The
   strategy is not "resolved" in both places.
5. **Shell-only = fallback, not a menu peer.**
6. **Test migration.** `buildLaunchSpec` stays backward-compatible: the existing
   `wtPath`/shell path is the Auto default, so current tests stay green; a new
   optional `terminal` argument selects a registry strategy when present.
7. **`terminalLauncher` vs strategy.** Strategies build the `LaunchSpec`;
   `terminalLauncher` only spawns it. The split is unchanged.

## Architecture

### 1. Core (pure) — `core/launch/terminals.ts`

```ts
export interface TerminalBuildArgs {
  terminalPath: string      // resolved exe/app path (from main)
  shell: string             // resolved shell (e.g. 'pwsh')
  projectName: string
  projectPath: string
  claudeCommand: string     // from buildClaudeCommand (already quoted)
}

export interface TerminalStrategy {
  id: string                // 'wt' | 'wtai' | 'terminal-app' | ...
  name: string              // display name for the dropdown
  platform: 'win32' | 'darwin'
  buildSpec(args: TerminalBuildArgs): LaunchSpec
}

export const TERMINALS: readonly TerminalStrategy[]
export function getTerminal(id: string): TerminalStrategy | null
export function terminalsForPlatform(p: 'win32' | 'darwin'): TerminalStrategy[]
```

- **Windows entries:** `wt` and `wtai`. Both build
  `<terminalPath> -w 0 new-tab --title <name> -d <path> <shell> -NoExit -Command <claudeCommand>`
  via a shared `buildWtArgs` (already exists). `wtai` is a distinct entry so it
  can diverge if `wtai.exe`'s arg surface differs.
- **Mac entries (stubs):** `terminal-app`, `iterm2`, `warp`, `ghostty` registered
  with `platform:'darwin'`. Their `buildSpec` throws a clear
  "not yet implemented" error and carries a doc comment specifying POSIX
  single-quote escaping (`'` → `'\''`) for the eventual `cd <path> && claude …`
  command. They are never invoked on Windows (detect is OS-filtered).

### 2. `core/launch/launchCommandBuilder.ts` — `buildLaunchSpec`

Add an optional `terminal` argument:

```ts
interface BuildLaunchSpecOptions {
  // …existing fields (shell, wtPath, projectName, …)…
  terminal?: { id: string; path: string } | null
}
```

- When `terminal` is present and `getTerminal(id)` resolves → call the strategy's
  `buildSpec` with `terminalPath = terminal.path`.
- Otherwise → existing behavior: `wtPath` present → wt args; else shell-only.

The existing `buildWtArgs`/`buildShellArgs`/`buildClaudeCommand` are reused. No
existing test changes.

### 3. `commandLocator` — terminal path resolution

- Windows: add `wtai.exe` lookup alongside the existing `wt.exe` resolution
  (PATH + `%LOCALAPPDATA%\Microsoft\WindowsApps`). A small
  `findTerminalPath(id)` maps id → exe and resolves it, or reuses `findOnPath`.
- Mac stub: returns null for now.

### 4. IPC `terminals:detect` (enriched, additive)

- Probe per-OS and return only **available, OS-appropriate** terminals as
  `{ id, name, path }` (the `path` field is new/additive; existing `{id,name}`
  consumers unaffected).
- Windows: `wt` (if `wt.exe` found), `wtai` (if `wtai.exe` found).
- Mac (later): detect `.app` bundles under `/Applications`.
- The result feeds the Settings dropdown; ids match the strategy registry.

### 5. main `launch:run`

- Load `state.terminalId` (already loading state for usage recording).
- If set and a matching terminal is available → resolve its path via
  `commandLocator`, pass `terminal:{id,path}` to `buildLaunchSpec`.
- If unset (Auto) or the selected terminal is unavailable → omit `terminal`
  (existing wt-or-shell behavior; silent shell fallback).

### 6. State + Settings UI

- `AppState.terminalId: string` (`''` = Auto). Added to the model +
  `configSerialization` (default `''`).
- `SettingsDialog`: an "Open sessions in:" `<select>` populated from
  `terminals:detect`, with an **Auto** option first; persists `terminalId` via
  `state:write`.

## Data flow

```
Settings dropdown ──> state.terminalId  (state.json)
                                 │
launch:run (main): read terminalId ──> commandLocator.findTerminalPath(id)
                                 │            │ path
                                 └─> buildLaunchSpec({ …, terminal:{id,path} })
                                              │ LaunchSpec
                                              └─> terminalLauncher.launch(spec)
```

## Error handling

| Condition                          | Behavior                                   |
|------------------------------------|--------------------------------------------|
| terminalId = '' (Auto)             | wt-if-present-else-shell (unchanged)       |
| Selected terminal not found at launch | Silent fallback to bare shell           |
| Mac strategy invoked (shouldn't on win) | buildSpec throws clear "not implemented" |
| `wtai.exe` arg incompatibility      | Caught during implementation; `wtai` strategy diverges from `wt` if needed |

## Testing

- **core/launch/terminals**: `wt`/`wtai` `buildSpec` argv correctness;
  `getTerminal`/`terminalsForPlatform` lookup + OS filtering; mac stub throws.
- **buildLaunchSpec**: back-compat (no `terminal` → current wt/shell output);
  with `terminal:{id,path}` → strategy output; unknown id → fallback.
- **commandLocator**: `wtai.exe` resolution (PATH + WindowsApps); null when absent.
- **handler terminals:detect**: returns OS-filtered, available-only `{id,name,path}`.
- **handler launch:run**: reads `state.terminalId`; resolves path; falls back when
  the selected terminal is missing.
- **SettingsDialog**: dropdown lists Auto + detected; selection persists `terminalId`.

## Out of scope (YAGNI)

- Per-project terminal override.
- macOS terminal implementations (registered as stubs only).
- Terminal-specific launch options (profiles, color schemes, split panes).
- Validating `wtai.exe` arg surface beyond what implementation reveals.
