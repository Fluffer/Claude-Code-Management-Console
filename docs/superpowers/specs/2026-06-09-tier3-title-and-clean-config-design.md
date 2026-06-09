# Tier 3 — Terminal title + clean-config design

**Date:** 2026-06-09
**Status:** Approved (design)
**Scope:** Two independent Tier 3 features for the Dev-Projects launcher.

## Summary

1. **Sticky terminal title** — every launched Claude session's terminal tab is
   titled with the project folder name, and that title *persists* for the life
   of the session.
2. **Clean default config** — a fresh install ships no personal source roots, and
   a first-run prompt guides a new user to add their own projects folder.

These are unrelated changes that share one PR. Each has its own tests.

---

## Feature 1 — Sticky terminal title = folder name

### Problem

`LaunchCommandBuilder.Build` already passes Windows Terminal `--title <folderName>`
when opening a tab. But `--title` only sets the *initial* tab title. Once `claude`
starts, it takes ownership of the terminal title and overwrites whatever WT set —
so the folder name does not stick.

The `claude` CLI exposes the correct mechanism:

```
-n, --name <name>   Set a display name for this session (session picker, and
                    terminal title) for this session only
```

Passing `-n <name>` makes `claude` itself set and hold the terminal title, which is
exactly the behaviour the user already relies on in their PowerShell `claude`
wrapper (`Microsoft.PowerShell_profile2.ps1`, `& $exe -n $title`).

### Change

In `src/DevProjects.Core/Services/LaunchCommandBuilder.cs`:

- Thread the project name into `BuildClaudeCommand`. `Build()` already receives
  `projectName`; pass it down to `BuildClaudeCommand`.
- `BuildClaudeCommand` prepends a `-n` argument to the `claude` invocation:
  `claude -n '<escapedName>' [--continue | '<prompt>'] [flags]`.
- **Escaping:** the claude command line is handed to PowerShell via `-Command`, so
  the name is wrapped in PowerShell **single quotes** with every `'` doubled
  (`'` → `''`). Inside single quotes PowerShell treats `$ \` ( ) ; | & # < > { }`
  as literal text, so an arbitrary Windows folder name (spaces, `&`, `#`,
  parentheses) is safe. The name therefore does **not** flow through
  `AreFlagsSafe`, which governs only the *user-supplied flags* string and stays
  unchanged.
- Keep the existing WT `--title <folderName>` argument. It sets the title before
  `claude` launches and removes the brief flash of a generic title at tab open.

Because resume launches (`--resume <id>`) and quick-prompt launches both route
through `BuildClaudeCommand`, they inherit the `-n` name automatically with no
extra work.

### Edge cases

- **Empty name:** `Build()` is always called with a non-empty project folder name
  (a scanned directory has a name). If `projectName` is null/whitespace, omit the
  `-n` argument entirely rather than emit `-n ''`.
- **No Windows Terminal (fallback path):** the plain-shell fallback already runs
  the same `claudeCommand`, so the `-n` flag applies there too — the title is set
  even without WT.

### Tests (`LaunchCommandBuilderTests` / extend existing)

- `BuildClaudeCommand("", continueSession: true, name: "Foo Bar")` →
  `claude -n 'Foo Bar' --continue`.
- Name with apostrophe `O'Brien` → `claude -n 'O''Brien'`.
- Name containing `&` and a space → command builds without throwing and the name
  is single-quoted; `AreFlagsSafe(userFlags)` is unaffected.
- Empty/whitespace name → no `-n` argument in the output.
- WT `Build(...)` arg list still contains `--title <folderName>`.

---

## Feature 2 — Clean default config for new installs

### Problem

`LauncherConfig.CreateDefault()` hardcodes the original developer's personal
source roots (`C:\Dev\Active`, `C:\Dev\Archive`, `C:\Dev\Scratch`,
`C:\Dev\Stable`, `C:\Dev\third-party`) and `DefaultRoot = C:\Dev\Active`. No
`config.json` is committed to the repo — config is generated at runtime under
`%APPDATA%\Dev-Projects\config.json` — so this source default is the *only* place
personal paths leak to a new user. A fresh install currently shows five phantom
roots that do not exist on the new machine.

### Change A — strip personal paths

In `src/DevProjects.Core/Models/LauncherConfig.cs`, `CreateDefault()`:

- `Roots = []` (empty list, not null — downstream code already tolerates both, but
  empty keeps the JSON shape stable).
- `DefaultRoot = null`.
- `Ignore = []` (unchanged).
- `Projects = new(...)` (unchanged — already empty).

Result: a fresh machine starts with zero roots and no personal data.

### Change B — first-run prompt

Add a one-time onboarding prompt so a brand-new user is actively guided to add a
root rather than facing an empty window.

- Add `public bool HasOnboarded { get; set; }` to `LauncherConfig` (default
  `false`). Old configs that lack the `hasOnboarded` key deserialize to `false`,
  which is harmless: an existing user already has roots, so the prompt's
  precondition (roots empty) is false for them.
- On startup, after the initial load, if **roots are empty AND `HasOnboarded` is
  false**, open the existing `SettingsDialog` (the same dialog the Settings button
  shows), then set `HasOnboarded = true` and save the config. This shows the
  prompt exactly once.
- Reuse `SettingsDialog` + `ViewModel.AddRoot(path)` — no new UI surface.
- The existing empty-state text ("No source roots configured yet. Open Settings to
  add the folders that contain your projects.") remains as the passive fallback
  for later launches.

### Why a flag instead of "prompt whenever roots are empty"

A user who deliberately removes all their roots should not be nagged with the
onboarding dialog on every launch. `HasOnboarded` makes the prompt a true
first-run event.

### Tests (`MiscServiceTests` / `ConfigServiceTests` as appropriate)

- `LauncherConfig.CreateDefault()` → `Roots` empty, `DefaultRoot` null,
  `HasOnboarded` false, `Projects` empty.
- Deserializing a legacy JSON document with no `hasOnboarded` key →
  `HasOnboarded == false` (back-compat).
- `HasOnboarded = true` round-trips through `ConfigService.Save` → `Load`.

The first-run prompt's wiring (open dialog when roots empty + not onboarded) lives
in the WinUI layer and is verified manually / via existing UI-test harness, not in
the Core unit tests.

### Migration note

The original developer's machine already has a populated
`%APPDATA%\Dev-Projects\config.json`, so `CreateDefault()` is never invoked there.
This change affects only genuinely fresh installs.

---

## Out of scope

- No change to `AreFlagsSafe` or the user-flags pipeline.
- No new settings UI beyond reusing `SettingsDialog`.
- No installer/packaging changes (config was never shipped).
