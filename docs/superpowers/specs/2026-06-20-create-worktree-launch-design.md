# Create-new-worktree launch — design

**Date:** 2026-06-20
**Status:** Approved (design), pending implementation
**Area:** electron app — git worktrees

## Problem

The app can launch a Claude session in an *existing* git worktree
(`WorktreePickerDialog` lists worktrees from `git worktree list`). There is no
way to **create a new worktree** and launch into it. Users want to fork a fresh
branch in an isolated folder and start Claude there in one step.

This is a net-new feature beyond the WinUI parity target (the original only
picks existing worktrees).

## Decisions (from brainstorming)

- **Entry point:** extend the existing `WorktreePickerDialog` with a "Create new
  worktree" section above the existing-worktree list. One dialog does both.
- **Base branch:** always the project's current branch (`HEAD`). No base picker.
- **Folder location:** sibling `<repoParent>/<repoLeaf>-<slug>` (git-conventional,
  no nesting). The resolved path is shown live in the dialog before creating.
- **Usage recording:** the launch into the new worktree passes `recordUsage:false`
  — the worktree path is not the tracked project, consistent with the existing
  worktree launch.

## Architecture

Four units, each with one purpose and a clear interface.

### 1. `core/git/worktreePath.ts` (pure, no fs/process)

The single source of truth for path/slug computation. Used by the **renderer**
(live preview) and **main** (actual creation) so the two never drift.

```ts
/** Slugify a branch name into a filesystem-safe folder suffix. */
export function worktreeSlug(branch: string): string

/** Resolve the sibling worktree folder path for a repo + branch. */
export function siblingWorktreePath(repoPath: string, branch: string): string
```

- `worktreeSlug`: replace `/`, `\`, and Windows-invalid characters
  (`<` `>` `:` `"` `|` `?` `*` and ASCII control chars) with `-`; collapse runs
  of `-`; trim leading/trailing `-`. Example: `feat/login` → `feat-login`.
- `siblingWorktreePath`: take `repoPath`, strip trailing separators, split into
  parent + leaf, return `<parent>/<leaf>-<slug(branch)>`. Preserves the repo
  path's separator style (backslash on Windows).

Edge cases: empty/whitespace branch → `worktreeSlug` returns `''`; callers must
guard before use (the dialog disables the button when the branch is blank).

### 2. `main/services/gitRunner.ts` — `addWorktree`

```ts
export async function addWorktree(
  repoPath: string,
  branch: string,
): Promise<{ ok: boolean; path?: string; error?: string }>
```

- Computes the target path via `siblingWorktreePath(repoPath, branch)`.
- Spawns `git -C <repoPath> worktree add -b <branch> <path> HEAD`.
- Success → `{ ok: true, path }`. Failure → `{ ok: false, error: <git stderr> }`.
- Never throws for expected git failures (folder/branch exists, not a repo);
  surfaces stderr as `error`. Follows the existing `getWorktrees` spawn pattern.

### 3. IPC channel `git:addWorktree`

```ts
'git:addWorktree': {
  req: { repoPath: string; branch: string }
  res: { ok: boolean; path?: string; error?: string }
}
```

Handler validates `repoPath`/`branch` are non-empty strings, then delegates to
`addWorktree`. Added to the `IPC` constant + `IpcMap` in `shared/ipc.ts`.

### 4. `WorktreePickerDialog` — "Create new worktree" section

New section rendered above the existing worktree list:

- Branch-name `TextInput`.
- Live preview line: the resolved folder path via `siblingWorktreePath`
  (using the project path). Empty branch → preview hidden.
- "Create & launch" button — disabled when the branch is blank or while busy.

On click:
1. `git:addWorktree({ repoPath: project.path, branch })`.
2. On `ok` → `launch:run({ projectName: project.name, projectPath: result.path,
   continueSession: false, recordUsage: false })` → `onClose()`.
3. On `!ok` → show `error` in the dialog's existing error area; stay open.

The existing pick-existing-worktree behavior is unchanged.

## Data flow

```
branch input ──(preview)──> siblingWorktreePath() ──> path label
   │
   └─(Create & launch)─> git:addWorktree ──> git worktree add -b … HEAD
                              │ ok {path}
                              └─> launch:run(path, recordUsage:false) ──> terminal
```

## Error handling

| Condition            | Behavior                                              |
|----------------------|-------------------------------------------------------|
| Branch blank         | Button disabled; no preview                           |
| Folder already exists| git fails → stderr shown in dialog error line         |
| Branch already exists| git fails → stderr shown in dialog error line         |
| Not a git repo       | git fails → stderr shown in dialog error line         |
| Launch fails post-create | worktree stays created; launch error shown in dialog |

## Testing

- **core/git/worktreePath**: slug sanitization (slashes, invalid chars, collapse,
  trim, empty); sibling path composition (separator preservation, trailing-sep
  repo paths). Pure unit tests.
- **main gitRunner.addWorktree**: mock spawn — asserts argv
  (`worktree add -b <branch> <path> HEAD`) and maps ok/stderr. Mirrors existing
  `getWorktrees` test style.
- **handler git:addWorktree**: validation (blank repoPath/branch throws); success
  + error pass-through.
- **WorktreePickerDialog**: preview updates with branch input; button disabled when
  blank; create → calls `git:addWorktree` then `launch:run` with `recordUsage:false`;
  error path keeps dialog open and shows the message.

## Out of scope (YAGNI)

- Base-branch picker (always HEAD).
- Custom folder picker / configurable location.
- Worktree removal/pruning UI.
- Pushing/tracking the new branch upstream.
