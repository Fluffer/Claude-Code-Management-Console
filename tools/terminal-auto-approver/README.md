# Terminal Auto-Approver

Watches **every Windows Terminal tab — foreground or background** — detects Y/N
and numbered permission prompts (Claude Code, npm, git, anything that reads the
console), and presses the right option for you.

## How it works (console-attach engine)

Windows Terminal tabs are XAML panes sharing one window HWND, so UI Automation
only exposes the *active* tab and SendKeys only hits the focused window. This
tool sidesteps both using the Win32 **console API**:

1. Enumerate each tab's shell process (children of `WindowsTerminal.exe`, minus
   `OpenConsole.exe`).
2. For each PID: `FreeConsole()` → `AttachConsole(pid)` → read the visible
   screen buffer with `ReadConsoleOutputCharacterW` (CONOUT$).
3. Detect a prompt in that text.
4. Inject the keystroke with `WriteConsoleInputW` (CONIN$) → `FreeConsole()`.

A process can attach to only one console at a time, so the script frees and
re-attaches per tab. **Consequence:** it loses its own console after the first
attach, so all output goes to the **log file**, not the screen. Run it hidden
and tail the log.

Verified end-to-end: read a background tab's live `Fetch` prompt and pressed
option 2 ("allow always") in that tab while it was **not** focused — Claude
accepted and proceeded. No foreground steal.

## Quick start

```powershell
# 1. Brain check (offline, no terminals touched)
pwsh -File Approver.ps1 -SelfTest

# 2. Live read of ALL tabs, decide, but press NOTHING
pwsh -File Approver.ps1 -DryRun
Get-Content approver.log -Wait     # in another pane

# 3. Arm it (rule-based auto-approve, all tabs)
start.cmd
#   or foreground:  pwsh -File Approver.ps1

# 4. Arm + local-model security gate
start.cmd -Classify
```

## Decision logic

Numbered menu — each option is tagged:

| option text matches            | tag           |
|--------------------------------|---------------|
| `don't ask again`, `always`    | `allowAlways` |
| starts `yes`/`allow`/`y`       | `allow`       |
| starts `no`/`deny`             | `deny`        |

Pick order (mode `approve`): **allowAlways → allow → skip**. So Claude's
`1. Yes` / `2. Yes, and don't ask again` → presses **2**.

Plain `(y/n)` → `y`.

## Keystroke tuning — `config.json -> keystroke`

- `numberedMenu`: `digitOnly` *(default, correct for Claude Code — the number
  key selects and confirms)* or `digitEnter` (number then Enter for classic
  menus).
- `ynPrompt`: `yEnter` *(default)* or `y`.

## Classifier (Phase 2) — `config.json -> classifier`

Mode `classify` sends the prompt text to a local model expecting one word:
`ALLOW` / `DENY` / `ASK`.

- `ALLOW` → presses allow/allow-always.
- `DENY`  → presses the No/Deny option (or `n`).
- `ASK`   → leaves it for you.

```json
"url":   "http://localhost:11434/api/generate",
"model": "qwen2.5-coder",
"fallbackOnError": "skip"   // model down: skip | allow | deny  (skip = fail safe)
```

NOTE: point `url`/`model` at a reachable endpoint. The ollama servers wired into
this machine are cloud MCP wrappers, not the local `:11434` daemon — set the URL
to whatever you actually run, or `fallbackOnError` decides every prompt.

## Modes & safety

- `config.json -> policy.mode`: `approve` (auto-approve everything recognized) |
  `classify` (gate first) | `off` (detect + log only, never press).
- `-DryRun` = temporary `off`.
- Cooldown + per-tab prompt-hash debounce stop re-pressing the same prompt or
  cascading into the next.
- Default `approve` approves **every** prompt it recognizes in **every** tab.
  Turn on `-Classify` once you trust the model to block destructive actions.

## Limits

- Targets the top-level shell of each tab. A split pane shows whichever buffer
  the console reports; multi-pane targeting isn't special-cased yet.
- Regex detection needs ≥2 `N.`/`N)` lines (or a `(y/n)`); tune `patterns` if a
  normal numbered list ever false-positives.
- Reads the visible viewport only (enough for prompts, which sit at the bottom).
