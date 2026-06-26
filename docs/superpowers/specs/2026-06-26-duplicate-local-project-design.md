# Duplicate a local project to a new folder

Date: 2026-06-26
Status: Approved (design)

## Problem

The console can clone an online git repo into a source root (`CloneRepoDialog` →
`git:clone`). There is no way to duplicate a project that already exists on disk
into a new folder. Users want a local copy to experiment on without touching the
original.

## Goal

From a project row, create a copy of that project in a new folder under a chosen
source root, using either a clean `git clone` of the local repo or an exact
filesystem copy.

## Decisions

- **Copy method — user picks per duplicate** (toggle in the dialog):
  - *Git clone (clean):* `git clone <sourcePath> <target>` — tracked files +
    full history, omits untracked/ignored cruft (node_modules, build output,
    `.env`). Disabled when the source is not a git repo.
  - *Exact copy:* recursive filesystem copy of everything, including `.git`,
    `node_modules`, `.env`, and untracked/ignored files.
  - Default mode: git when the source is a repo, otherwise exact copy.
- **Post-action:** create → refresh the list → select the new project → show a
  toast offering an "Open session" action (does not auto-launch).

## Entry point

Row context menu (`ContextMenu.tsx`) gains a **"Duplicate…"** item, placed after
"Move to root". It dispatches a new action `{ kind: 'duplicate', project }`.
`App.tsx` routes that action to `openDialog({ kind: 'duplicate', project, roots,
defaultRoot, isGitRepo, projects })`, where `isGitRepo` comes from the row
enrichment (`enrichment.gitBranch != null`) and `projects` is the current
project list (used to compute the free default name without new IPC).

## UI — `DuplicateProjectDialog`

New dialog component, modelled on `CloneRepoDialog`.

Fields:
- **Source** (read-only): project name + path, for confirmation.
- **Copy mode** toggle: "Git clone (clean)" | "Exact copy". The git option is
  disabled when `isGitRepo` is false; selection initialises to git for repos,
  copy otherwise.
- **Name**: prefilled with the first free name derived from the source name
  (`<name>-copy`, then `-copy-2`, `-copy-3`, … against existing sibling folders
  in the selected root). Re-derived when the root changes and the user has not
  manually edited the field. Live-validated with the existing
  `validateCloneName`.
- **Root** select: configured roots; defaults to the source's own root.

Footer: Cancel / Duplicate. While running, the Duplicate button shows
"Duplicating…" and the dialog is busy. On error, an inline error message is
shown (same pattern as `CloneRepoDialog`).

The dialog needs the list of sibling folder names per root to compute the free
default name. It reads them from the `projects` array in the dialog payload
(names of projects whose `root` equals the selected root) — no new IPC for name
derivation.

## IPC — `project:duplicate`

Add to `shared/ipc.ts`:

```
'project:duplicate': {
  req: { sourcePath: string; targetRoot: string; name: string; mode: 'git' | 'copy' }
  res: { ok: boolean; path?: string; error?: string }
}
```

(Plus the `PROJECT_DUPLICATE: 'project:duplicate'` channel constant alongside the
others.) No preload change — preload exposes a generic typed `invoke<C extends
keyof IpcMap>`, so adding to `IpcMap` is sufficient.

### Handler (`main/ipc/handlers.ts`)

Reuses the `git:clone` guard sequence, then dispatches by mode:

1. Validate `targetRoot` is a configured source root (case-insensitive resolve).
2. Validate `name` with `validateCloneName`; reject on failure.
3. Resolve `full = path.resolve(targetRoot, name)`; assert it stays within the
   root (path-traversal guard, as in `git:clone`).
4. Validate `sourcePath` exists and is a directory.
5. Assert `full` is **not** the source and **not nested inside** `sourcePath`
   (prevents copying a folder into itself).
6. Reject if `full` already exists.
7. Dispatch:
   - `mode === 'git'`: require `<sourcePath>/.git` to exist (else
     `{ ok: false, error: 'Source is not a git repository.' }`), then
     `cloneRepo(sourcePath, full)` (the existing `gitRunner` helper — a local
     path is a valid clone source).
   - `mode === 'copy'`: `await fs.cp(sourcePath, full, { recursive: true })`,
     returning `{ ok: true, path: full }`; map errors to `{ ok: false, error }`.

Security notes: `sourcePath` originates from the trusted project list but is
re-validated server-side (exists + directory). The traversal and
not-nested-in-source guards prevent both directory escape and infinite copy.

## Core — `core/projects/duplicateName.ts`

Pure, no I/O, unit-tested:

```
deriveDuplicateName(sourceName: string, siblings: string[]): string
```

Returns `<sourceName>-copy` when free, else the first free `<sourceName>-copy-N`
(N starting at 2). Comparison against `siblings` is case-insensitive. The result
is a folder name only (callers still run it through `validateCloneName`).

## Toast extension

`Toast` currently supports only `showToast(message, variant)`. Add an optional
action:

```
showToast(message: string, variant?: ToastVariant, action?: { label: string; onClick: () => void })
```

`ToastItem` renders the action as a button before the dismiss control when
present. This is a minimal, backward-compatible addition (existing two-arg calls
are unaffected) and is reused for the "Open session" affordance.

## Post-action flow (renderer)

On `project:duplicate` success:
1. `onRefresh()` so the new project appears.
2. Select the new project (by its returned path).
3. `showToast('Duplicated to <name>', 'info', { label: 'Open session', onClick:
   … })`; the action invokes `launch:run` with the new project path
   (`continueSession: false`, `recordUsage: false`), mirroring the clone flow's
   launch call.

## Testing

- **Core:** `duplicateName.test.ts` — free name, single collision → `-copy-2`,
  multiple collisions, case-insensitivity, source name already ending in
  `-copy`.
- **Main:** handler tests — bad root, invalid name, traversal attempt, missing
  source, source-not-a-directory, target exists, target nested in source, git
  mode dispatch (mock `cloneRepo`), copy mode dispatch (mock `fs.cp`), non-repo
  in git mode → error.
- **Renderer:** `DuplicateProjectDialog.test.tsx` — git toggle disabled for
  non-repo, default name derivation + collision bump, name validation blocks
  submit, correct `project:duplicate` args per mode, success path triggers
  refresh + toast-with-action.
- **Toast:** action button renders and fires `onClick`; two-arg calls still work.

## Files

- `electron/src/core/projects/duplicateName.ts` (+ test)
- `electron/src/shared/ipc.ts` — channel constant + `project:duplicate` contract
- `electron/src/main/ipc/handlers.ts` — `project:duplicate` handler
- `electron/src/main/services/gitRunner.ts` — reuse `cloneRepo`; fs copy is
  inline in the handler (Node `fs/promises.cp`)
- `electron/src/renderer/components/ui/Toast.tsx` — optional action
- `electron/src/renderer/features/projects/projectActions.ts` — `duplicate` kind
- `electron/src/renderer/features/projects/ContextMenu.tsx` — "Duplicate…" item
- `electron/src/renderer/features/dialogs/useDialogs.tsx` + dialog host —
  `duplicate` dialog kind + render
- `electron/src/renderer/App.tsx` — route `duplicate` action → `openDialog`
- `electron/src/renderer/features/dialogs/DuplicateProjectDialog.tsx` (new, + test)

## Out of scope (YAGNI)

- Copy progress bar / cancellation for large exact copies (show a busy state
  only).
- Selective include/exclude of files within exact copy.
- Cross-machine or remote duplication.
