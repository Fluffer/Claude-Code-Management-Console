# Design — clone repo + commit + open-PR from the GUI

**Date:** 2026-06-20 · **Branch:** `feat/electron-rewrite`
Three new GUI git actions. No WinUI precedent (greenfield). Reuses the existing
`execFile('git', …, {cwd, windowsHide})` fail-soft pattern in `main/services/gitRunner.ts`
and the dialog/context-menu/launch patterns from the create-worktree + terminal-selection work.

## Features

1. **Clone repo** — clone a git URL into a chosen source root under a custom name, then launch
   Claude into the clone.
2. **Commit** — `git add -A` + commit (optionally push) with a message, per project.
3. **Open PR** — commit-if-dirty → push → `gh pr create`, returning the PR URL, per project.

## New pure helpers (`electron/src/core/git/`, fully unit-tested)

- `deriveCloneName(url: string): string` — default folder name from a clone URL: strip a trailing
  `.git`, take the last path segment. Handles `https://github.com/me/foo.git`,
  `git@github.com:me/foo.git`, trailing slashes. Returns `''` if nothing derivable.
- `validateCloneName(name: string): { ok: true } | { ok: false; reason: string }` — reject empty/
  whitespace, path separators (`/` `\`), and characters illegal in a Windows folder name
  (`< > : " | ? *`). Reserved for the clone target folder name only.
- `parsePrUrl(stdout: string): string | null` — extract the first `https://…/pull/<n>` URL from
  `gh pr create` stdout (gh prints the PR URL on its own line). Null if absent.

## New gitRunner functions (`electron/src/main/services/gitRunner.ts`, fail-soft `{ ok, … }`)

All spawn via `execFileAsync` with `windowsHide: true`, returning git/gh stderr as `error` on failure
(never throw). Timeouts: clone/push/pr are network ops → 120s; commit → 30s.

- `cloneRepo(url, targetDir): Promise<{ ok; path?; error? }>`
  Pre-check: if `targetDir` already exists → `{ ok:false, error:'Target folder already exists: …' }`.
  Spawn `git clone <url> <targetDir>` (cwd = the parent root). On success `path = targetDir`.
- `commitAll(path, message, push): Promise<{ ok; error? }>`
  `git add -A` → `git commit -m <message>`. If `push`: `git push -u origin HEAD`. If `git commit`
  reports "nothing to commit", surface that as the error (the caller's dialog shows it).
- `openPr(path, { commitMessage, title, body }, ghPath): Promise<{ ok; url?; error? }>`
  If the tree is dirty (`getIsDirty`) and `commitMessage` is non-empty → `git add -A` + commit.
  `git push -u origin HEAD`. Then `execFile(ghPath, ['pr','create','--title',title,'--body',body ?? '','--head',<branch>])`.
  `branch` from `getBranchInfo`. Parse stdout via `parsePrUrl` → `url`. gh's own stderr (e.g. PR from a
  default branch, not authenticated) surfaces as `error`.

`gh` is resolved in the IPC handler via `commandLocator.findOnPath('gh')`; if null →
`{ ok:false, error:'GitHub CLI (gh) not found on PATH. Install gh and run `gh auth login`.' }`,
`openPr` is not spawned.

## IPC (`shared/ipc.ts`, `main/ipc/handlers.ts`)

| Channel | req | res |
|---|---|---|
| `git:clone` | `{ url; targetRoot; name }` | `{ ok; path?; error? }` |
| `git:commit` | `{ path; message; push }` | `{ ok; error? }` |
| `git:openPr` | `{ path; commitMessage?; title; body? }` | `{ ok; url?; error? }` |

`git:clone` composes `targetDir = join(targetRoot, name)` and re-validates `name` server-side
(`validateCloneName`) before spawning — never trust the renderer. `git:openPr` resolves `gh` and
short-circuits with the not-found error when absent.

## Renderer

New project-action kinds in `features/projects/projectActions.ts`: `commit`, `open-pr`
(both gated to git projects). Clone is a command-bar action, not per-project.

- **CloneRepoDialog** (`features/dialogs/CloneRepoDialog.tsx`) — opened from the command-bar New
  area. Fields: URL (required), Name (prefilled from `deriveCloneName(url)` as the user types the URL,
  but user-editable; live `validateCloneName`), Root (`<select>` of `config.roots`, default
  `config.defaultRoot`). Clone button disabled until URL + valid name + a root. On success: refresh
  the list, then `launch:run { projectName:name, projectPath:path, continueSession:false,
  recordUsage:false }` (sibling to the worktree-launch flow). Errors shown inline.
- **CommitDialog** (`features/dialogs/CommitDialog.tsx`) — context-menu "Commit…". Shows the current
  branch; multiline message (required). Buttons **Commit** (`push:false`) and **Commit & Push**
  (`push:true`). On success toast + close; on error show inline (incl. "nothing to commit").
- **OpenPrDialog** (`features/dialogs/OpenPrDialog.tsx`) — context-menu "Open PR…". Loads dirty state
  on open (`git:info`). Fields: Title (prefilled from the branch name), Body (optional), and a Commit
  message field shown **only when dirty** (required in that case). Submit → `git:openPr`. On success:
  toast with the PR URL, open it via `shell:openPath`/external, close. Errors inline.

Conditional visibility: `commit` and `open-pr` context-menu items appear only when the project's
enrichment `gitBranch != null` — the same gate the worktree item uses (`useProjectEnrichment`).

## Decisions / non-goals

- **gh missing/unauthed:** fail-soft with a clear message (above). No silent failure.
- **PR from default branch:** no auto-branching in v1; gh's error surfaces verbatim.
- **Private-repo clone auth:** relies on the ambient git credential manager; failures surface fail-soft.
- **Out of scope (YAGNI):** per-file staging, amend, branch create/switch, PR templates, force-push,
  clone progress bar (spinner only).

## Verification

- Pure helpers (`deriveCloneName`, `validateCloneName`, `parsePrUrl`) and gitRunner argument shaping
  fully unit-tested; dialogs get focused renderer tests for validation/enablement.
- Gates: `npm run build`, `npm run lint`, `npx vitest run` green.
- Council (Ollama, cap 3) reviews the gitRunner spawn logic + handlers.
- Live: launch the app, exercise a clone of a small public repo and a commit on a throwaway branch;
  read main-process logs. GUI confirmation is the user's (the project discipline).
