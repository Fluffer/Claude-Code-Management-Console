# Project Capabilities + Launcher Roadmap (P0–P4)

**Date:** 2026-06-20
**Status:** Approved design — ready for implementation planning
**App:** Claude Code Management Console (Electron / React 18 / TypeScript)

## Summary

Five phased features that surface Claude Code project capabilities (slash commands,
skills) in the GUI and enrich the launcher. Origin: an evaluation with the Ollama
"council" of the existing app, which recommended reprioritizing the user's original
idea (a unified MCP-style capabilities panel) toward user-invoked actions and
higher-value session/cost features.

Delivered as **one phased roadmap, one spec, incremental ship order P0 → P4**.

### Council findings that shaped this design

- **VS Code open already 90% built** — `shell:openInVscode` IPC + `code <path>` spawn
  exist (`register.ts`); only the context-menu entry is missing.
- **Slash commands beat skills for a GUI.** Commands are user-invoked (need discovery
  before launch); skills are Claude-invoked (awareness only). So commands are
  actionable, skills are read-only.
- **Reject a unified "capabilities panel."** Different interaction models. Drop
  subagents and hooks viewers (low value; hooks parsing is fragile).
- **Higher-value gaps the user hadn't asked for:** session/transcript browser, cost
  tracking, MCP health check.
- **Verified-false council claims** (do not act on): file-watch has no debounce (it
  debounces 150 ms in `fileWatch.ts`); watcher handle exhaustion (only 2 files watched).
- **Verified-real smell:** running-session detection is a PowerShell
  `Get-CimInstance Win32_Process` poll matching `CommandLine` (not CWD). Out of scope
  here; noted for a future optimization pass.

## Decisions (locked with user)

| Decision | Choice |
|----------|--------|
| Packaging | One roadmap spec, phased |
| P1 commands / P3 skills | Commands actionable (launch pre-filled); skills read-only |
| Edit scope | Read-only everywhere + "open file in VS Code" button |
| P4 cost data source | Researched & confirmed: transcript `usage` fields |

## Shared architecture

Every new disk-reader follows the existing, proven MCP pattern:

```
core/<x>/<x>Reader.ts      pure parser, no Electron, unit-tested   (mirror core/config/mcpConfigReader.ts)
main/services/<x>Store.ts  thin fs wrapper                          (mirror main/services/mcpStore.ts)
shared/ipc.ts              typed channel + req/res pair             (mirror mcp:read)
main/ipc/handlers.ts       pure handler                             (mirror mcp:read handler)
renderer dialog / badge    viewer dialog + enrichment badge         (mirror McpViewerDialog)
```

Principles:
- No new frameworks or dependencies.
- All parsers are pure functions in `core/`, unit-tested with Vitest like the existing suite.
- Defensive parsing: malformed input → empty result, never throw (matches `mcpConfigReader`).
- New file readers reuse the path-allowlist / traversal guard already used by `git:clone`
  (validate target path is within a configured root before reading).
- Enrichment hook (`useProjectEnrichment`, concurrency 8, file-watch invalidated) gains
  new fields; no new fetch mechanism.
- **Fold in P0 parity gap** (from `docs/.../2026-06-20-parity-gaps.md`): conditional
  context-menu visibility — show an action only when its capability is present
  (`hasSkills`, `hasCommands`, `hasMcp`, `isRunning`, `hasGitInfo`).

Shared building blocks built once, reused across phases:
- `core/config/frontmatter.ts` — minimal YAML-frontmatter parser (name, description). Used by P1 + P3.
- Viewer-dialog shell — generalized from `McpViewerDialog` (list table + per-row open-in-VSCode button).
- Per-row "open in VS Code" affordance — opens the backing file; retrofit to the MCP viewer too.

---

## P0 — VS Code action  `[~free]`

**Goal:** surface the existing VS Code open capability.

- New `ProjectAction` kind `open-vscode` → calls existing `shell:openInVscode` IPC
  (`code <path>`, already implemented in `register.ts`).
- Add context-menu entry (always visible).
- Add to command palette as a global action ("Open <project> in VS Code").

No new IPC, no new backend. Pure wiring.

---

## P1 — Slash-command launcher  `[actionable]`

**Goal:** discover project slash commands and launch one.

- **Read:** new `commands:list` IPC → scans `<project>/.claude/commands/*.md`.
  Name = filename (sans `.md`); description = frontmatter `description:` if present
  (uses shared `frontmatter.ts`). Pure parser `core/projects/commandList.ts`.
- **Act:** new `CommandPickerDialog` → user picks a command → build
  `LaunchRequest{ initialPrompt: "/<name>" }` → existing `launch:run`. No new launch plumbing.
- **Discoverability:** `commandCount` in enrichment → badge on row; palette entry
  "Run command in <project>".
- Per-row "open in VS Code" button (opens the `.md`).

---

## P3 — Skills viewer  `[read-only]`

**Goal:** awareness of installed project skills.

- **Read:** new `skills:list` IPC → scans `<project>/.claude/skills/*/SKILL.md`
  frontmatter (`name`, `description`). Shares `frontmatter.ts`. Pure parser
  `core/projects/skillList.ts`.
- **UI:** `SkillsViewerDialog` cloned from `McpViewerDialog`. Read-only table:
  name + description. `hasSkills` enrichment badge.
- Per-row "open in VS Code" (opens the `SKILL.md`).

*P1 + P3 share the frontmatter parser, the viewer-dialog shell, and the open-in-VSCode
button — build once, use in both.*

---

## P2 — Session / transcript browser  `[read-only]`

**Goal:** browse and search past session transcripts; resume from there.

Upgrade the existing `ResumeSessionDialog` (already lists
`~/.claude/projects/<encoded>/*.jsonl` via `sessions:listHistory`) into a browser:

- **Read:** new `sessions:readTranscript` IPC → parses one jsonl into
  `[{ role, textExcerpt, timestamp, usage }]`. Pure parser
  `core/claude/transcriptParser.ts`.
- **UI:** session list (left) + message preview pane (right) + text search. Resume
  button reuses existing `claude --resume <id>`.
- **Perf:** cap excerpt length; lazy-load the preview only on session selection (never
  parse all transcripts up front).

Transcript format (confirmed on disk): jsonl, one record per line, with `type`,
`sessionId`, `timestamp`, `model`, and an assistant `usage` object. Nested under
`~/.claude/projects/<encoded>/` including `subagents/` sub-transcripts.

---

## P4 — Cost tracking + MCP health  `[2 sub-features]`

### P4a — Cost tracking  `[confirmed feasible]`

Transcript `usage` carries `input_tokens`, `output_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens`, plus `model` per assistant
message.

- `core/cost/priceTable.ts` — per-model USD/Mtok for the **four token classes
  separately** (input, output, cache-read, cache-write). Maintained constant, sourced
  from the `claude-api` skill. Cache-heavy sessions are mispriced if classes are
  collapsed — keep them separate.
- `core/cost/costCalculator.ts` — pure: sum transcript usage × price → per-session and
  per-project totals. Reuses P2's `transcriptParser`.
- **Surface:** per-project total in the row tooltip/badge (`costUSD` in enrichment);
  per-session cost in the P2 browser.
- Unknown-model fallback: if a `model` id is absent from the price table, mark the
  session cost "unknown" rather than guessing.

### P4b — MCP health check  `[⚠ not read-only]`

- Health-checking an **stdio** MCP server **executes the server command** — a side
  effect, the one non-read-only addition in this roadmap. Gate it behind an explicit
  "Check health" button in `McpViewerDialog`; **never** run automatically on scan.
- `http`/`sse` servers → cheap HTTP probe.
- `stdio` servers → spawn with timeout; report started / failed / timed-out.
- New `mcp:health` IPC. Apply the same spawn-safety as existing git/terminal launches
  (array args, no shell interpolation, timeout kill).

---

## Cross-cutting

- **Security:** new readers reuse the path-allowlist guard from `git:clone`; `mcp:health`
  reuses spawn-safety from terminal/git launches (array args, timeout kill, no shell string).
- **Enrichment additions:** `hasSkills`, `commandCount`, `costUSD` (plus existing
  `hasClaudeMd`, `hasMcp`, `defaultModel`). Same 8-way concurrency, same file-watch
  invalidation.
- **Testing:** each pure parser (`frontmatter`, `commandList`, `skillList`,
  `transcriptParser`, `costCalculator`) gets a Vitest unit suite mirroring
  `mcpConfigReader`'s tests, including malformed-input cases.
- **Out of scope (noted for later):** in-app editors for MCP/commands/skills; subagents
  and hooks viewers; the Win32_Process session-detection optimization; deep-link
  generation context action (council bonus, deferred).

## Ship order

```
P0  VS Code action               ~free, no backend
P1  Slash-command launcher       + shared frontmatter parser, viewer shell
P3  Skills viewer                reuses P1 shared blocks
P2  Session/transcript browser   + transcriptParser
P4a Cost tracking                reuses transcriptParser + price table
P4b MCP health (manual button)   spawn-gated, last
```

## Open risks

- P2: very large transcripts — mitigated by lazy-load + excerpt caps; validate on the
  biggest real transcript before shipping.
- P4a: price table drift — model prices change; treat the table as maintained config and
  mark unknown models rather than guessing.
- P4b: executing MCP server commands for health — kept manual + spawn-safe; revisit if
  any server is slow/hangs despite timeout.
