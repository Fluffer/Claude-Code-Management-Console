# Duplicate Local Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user duplicate an on-disk project into a new folder under a chosen source root, via either a clean local `git clone` or an exact filesystem copy.

**Architecture:** A pure core helper derives a free target name. A main-process `projectDuplicator` service performs the copy (git clone or `fs.cp`) behind the existing service-per-operation pattern. A new `project:duplicate` IPC handler validates root/name/traversal and calls the service. A new `DuplicateProjectDialog` (reached from the row context menu) drives it, and a small Toast action extension powers the "Open session" affordance.

**Tech Stack:** TypeScript, Electron (electron-vite), React, Vitest, Node `fs/promises`, the existing `gitRunner.cloneRepo`.

## Global Constraints

- All work is under `electron/`. Run commands from `electron/`.
- Test runner: `npx vitest run <path>` (single file) — do NOT use a global watch.
- Lint must stay clean: `npm run lint`.
- Folder-name validation uses the existing `validateCloneName` from `core/git/cloneName.ts`. Do not reimplement it.
- Windows is the target platform; paths use `path.sep`. Keep all path joins via `node:path`.
- IPC is fully typed through `IpcMap` in `src/shared/ipc.ts`; the preload exposes a generic `invoke<C extends keyof IpcMap>`, so adding a channel to `IpcMap` is sufficient (no preload edit).
- Copy modes (verbatim from spec): `'git'` = `git clone <source> <target>` (tracked + history, omits untracked/ignored); `'copy'` = `fs.cp(source, target, { recursive: true })` (exact, includes `.git`, `node_modules`, `.env`).
- Commit after each task with the shown message.

---

### Task 1: Core `deriveDuplicateName`

**Files:**
- Create: `electron/src/core/projects/duplicateName.ts`
- Test: `electron/tests/core/projects/duplicateName.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `deriveDuplicateName(sourceName: string, siblings: string[]): string` — returns `<sourceName>-copy` if free, else the first free `<sourceName>-copy-N` (N from 2). Case-insensitive comparison against `siblings`. Returns a folder name only.

- [ ] **Step 1: Write the failing test**

Create `electron/tests/core/projects/duplicateName.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveDuplicateName } from '../../../src/core/projects/duplicateName'

describe('deriveDuplicateName', () => {
  it('returns <name>-copy when no sibling collides', () => {
    expect(deriveDuplicateName('app', [])).toBe('app-copy')
    expect(deriveDuplicateName('app', ['other'])).toBe('app-copy')
  })

  it('bumps to -copy-2 when -copy already exists', () => {
    expect(deriveDuplicateName('app', ['app-copy'])).toBe('app-copy-2')
  })

  it('finds the first free suffix across multiple collisions', () => {
    expect(deriveDuplicateName('app', ['app-copy', 'app-copy-2', 'app-copy-3'])).toBe('app-copy-4')
  })

  it('compares siblings case-insensitively', () => {
    expect(deriveDuplicateName('App', ['app-COPY'])).toBe('App-copy-2')
  })

  it('handles a source name that already ends in -copy', () => {
    expect(deriveDuplicateName('app-copy', ['app-copy'])).toBe('app-copy-copy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/projects/duplicateName.test.ts`
Expected: FAIL — cannot resolve `src/core/projects/duplicateName`.

- [ ] **Step 3: Write minimal implementation**

Create `electron/src/core/projects/duplicateName.ts`:

```ts
/**
 * Pure helper: derive a free target folder name for duplicating a project.
 *
 * Returns `<sourceName>-copy` when no sibling folder collides, otherwise the
 * first free `<sourceName>-copy-N` (N starting at 2). Comparison against the
 * sibling list is case-insensitive. No I/O — callers still run the result
 * through validateCloneName.
 */
export function deriveDuplicateName(sourceName: string, siblings: string[]): string {
  const taken = new Set(siblings.map((s) => s.toLowerCase()))
  const base = `${sourceName}-copy`
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base}-${n}`.toLowerCase())) n++
  return `${base}-${n}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/projects/duplicateName.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/projects/duplicateName.ts electron/tests/core/projects/duplicateName.test.ts
git commit -m "feat(core): add deriveDuplicateName for local project duplication"
```

---

### Task 2: `projectDuplicator` service

**Files:**
- Create: `electron/src/main/services/projectDuplicator.ts`
- Test: `electron/tests/main/services/projectDuplicator.test.ts`

**Interfaces:**
- Consumes: `cloneRepo(url: string, targetDir: string): Promise<{ ok: boolean; path?: string; error?: string }>` from `./gitRunner`.
- Produces:
  ```ts
  interface DuplicateOptions { sourcePath: string; targetDir: string; mode: 'git' | 'copy' }
  duplicateProject(opts: DuplicateOptions): Promise<{ ok: boolean; path?: string; error?: string }>
  ```
  Guards (in order): source exists and is a directory; target is not the source and not nested inside it; target does not already exist. Then: `git` mode requires `<source>/.git` and calls `cloneRepo`; `copy` mode runs `fs.cp(source, target, { recursive: true })`.

- [ ] **Step 1: Write the failing test**

Create `electron/tests/main/services/projectDuplicator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

vi.mock('../../../src/main/services/gitRunner', () => ({
  cloneRepo: vi.fn(async (_url: string, target: string) => ({ ok: true, path: target })),
}))

import { duplicateProject } from '../../../src/main/services/projectDuplicator'
import { cloneRepo } from '../../../src/main/services/gitRunner'

let work: string
beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'dup-'))
  vi.clearAllMocks()
})
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

describe('duplicateProject', () => {
  it('errors when the source does not exist', async () => {
    const res = await duplicateProject({ sourcePath: path.join(work, 'nope'), targetDir: path.join(work, 'out'), mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not found/i)
  })

  it('errors when the target is nested inside the source', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    const res = await duplicateProject({ sourcePath: src, targetDir: path.join(src, 'inner'), mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/into itself/i)
  })

  it('errors when the target already exists', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    const dst = path.join(work, 'dst'); await mkdir(dst)
    const res = await duplicateProject({ sourcePath: src, targetDir: dst, mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already exists/i)
  })

  it('copy mode recursively copies everything (including untracked files)', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    await writeFile(path.join(src, '.env'), 'SECRET=1')
    await mkdir(path.join(src, 'node_modules'))
    await writeFile(path.join(src, 'node_modules', 'x.txt'), 'dep')
    const dst = path.join(work, 'dst')
    const res = await duplicateProject({ sourcePath: src, targetDir: dst, mode: 'copy' })
    expect(res.ok).toBe(true)
    expect(res.path).toBe(dst)
    expect((await stat(path.join(dst, '.env'))).isFile()).toBe(true)
    expect((await stat(path.join(dst, 'node_modules', 'x.txt'))).isFile()).toBe(true)
  })

  it('git mode errors when the source is not a repo', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    const res = await duplicateProject({ sourcePath: src, targetDir: path.join(work, 'dst'), mode: 'git' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not a git repository/i)
    expect(cloneRepo).not.toHaveBeenCalled()
  })

  it('git mode delegates to cloneRepo when the source is a repo', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    await mkdir(path.join(src, '.git'))
    const dst = path.join(work, 'dst')
    const res = await duplicateProject({ sourcePath: src, targetDir: dst, mode: 'git' })
    expect(res.ok).toBe(true)
    expect(cloneRepo).toHaveBeenCalledWith(path.resolve(src), path.resolve(dst))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/services/projectDuplicator.test.ts`
Expected: FAIL — cannot resolve `src/main/services/projectDuplicator`.

- [ ] **Step 3: Write minimal implementation**

Create `electron/src/main/services/projectDuplicator.ts`:

```ts
import { cp, stat } from 'node:fs/promises'
import path from 'node:path'
import { cloneRepo } from './gitRunner'

/**
 * Duplicates a project folder into a new location, either as a clean local
 * `git clone` (tracked files + history only) or an exact recursive filesystem
 * copy (everything, including .git / node_modules / .env). Never throws.
 */
export interface DuplicateOptions {
  sourcePath: string
  targetDir: string
  mode: 'git' | 'copy'
}

export async function duplicateProject(
  opts: DuplicateOptions,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const { sourcePath, mode } = opts
  const src = path.resolve(sourcePath)
  const dst = path.resolve(opts.targetDir)

  let srcStat
  try {
    srcStat = await stat(src)
  } catch {
    return { ok: false, error: `Source folder not found: ${src}` }
  }
  if (!srcStat.isDirectory()) {
    return { ok: false, error: 'Source is not a folder.' }
  }

  if (dst === src || dst.startsWith(src + path.sep)) {
    return { ok: false, error: 'Cannot duplicate a folder into itself.' }
  }

  try {
    await stat(dst)
    return { ok: false, error: `Target folder already exists: ${dst}` }
  } catch {
    // does not exist → safe to proceed
  }

  if (mode === 'git') {
    try {
      await stat(path.join(src, '.git'))
    } catch {
      return { ok: false, error: 'Source is not a git repository.' }
    }
    return cloneRepo(src, dst)
  }

  try {
    await cp(src, dst, { recursive: true })
    return { ok: true, path: dst }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/services/projectDuplicator.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/src/main/services/projectDuplicator.ts electron/tests/main/services/projectDuplicator.test.ts
git commit -m "feat(main): add projectDuplicator service (git clone / exact copy)"
```

---

### Task 3: IPC contract + `project:duplicate` handler

**Files:**
- Modify: `electron/src/shared/ipc.ts` (add channel constant + `IpcMap` entry)
- Modify: `electron/src/main/ipc/handlers.ts` (import service + add handler)
- Test: `electron/tests/main/ipc/handlers-duplicate.test.ts`

**Interfaces:**
- Consumes: `duplicateProject` (Task 2); `validateCloneName` (existing); `loadConfig(configPath)` (existing, already imported in handlers).
- Produces: IPC channel `'project:duplicate'` with `req: { sourcePath: string; targetRoot: string; name: string; mode: 'git' | 'copy' }`, `res: { ok: boolean; path?: string; error?: string }`.

- [ ] **Step 1: Write the failing test**

Create `electron/tests/main/ipc/handlers-duplicate.test.ts` (mirrors the real-fs style of `handlers.test.ts`; reuse its `makeDeps`/`makeConfigPath` approach inline):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let work: string
let configPath: string

async function makeDeps(roots: string[]): Promise<IpcHandlerDeps> {
  configPath = path.join(work, 'config.json')
  await writeFile(configPath, JSON.stringify({ roots, defaultRoot: roots[0] ?? null, hidden: [] }))
  return {
    configPath,
    statePath: path.join(work, 'state.json'),
    processInspector: {} as IpcHandlerDeps['processInspector'],
    sessionKiller: {} as IpcHandlerDeps['sessionKiller'],
    terminalLauncher: {} as IpcHandlerDeps['terminalLauncher'],
    commandLocator: {} as IpcHandlerDeps['commandLocator'],
  } as IpcHandlerDeps
}

beforeEach(async () => { work = await mkdtemp(path.join(tmpdir(), 'dup-ipc-')) })
afterEach(async () => { await rm(work, { recursive: true, force: true }) })

describe('project:duplicate', () => {
  it('rejects a target root that is not configured', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: path.join(work, 'other'), name: 'src-copy', mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/source root/i)
  })

  it('rejects an invalid name', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: root, name: 'bad/name', mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/separator/i)
  })

  it('copies the project into the configured root', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    await writeFile(path.join(src, 'file.txt'), 'hi')
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: root, name: 'src-copy', mode: 'copy' })
    expect(res.ok).toBe(true)
    expect(res.path).toBe(path.join(root, 'src-copy'))
    expect((await stat(path.join(root, 'src-copy', 'file.txt'))).isFile()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/ipc/handlers-duplicate.test.ts`
Expected: FAIL — `handlers['project:duplicate']` is not a function (and a TS error that `'project:duplicate'` is not in `IpcMap`).

- [ ] **Step 3a: Add the IPC contract**

In `electron/src/shared/ipc.ts`, add the channel constant next to `GIT_CLONE: 'git:clone',`:

```ts
  PROJECT_DUPLICATE: 'project:duplicate',
```

And add to the `IpcMap` interface, immediately after the `'git:clone'` entry:

```ts
  'project:duplicate': {
    req: { sourcePath: string; targetRoot: string; name: string; mode: 'git' | 'copy' }
    res: { ok: boolean; path?: string; error?: string }
  }
```

- [ ] **Step 3b: Add the handler**

In `electron/src/main/ipc/handlers.ts`, add the import near the other service imports:

```ts
import { duplicateProject } from '../services/projectDuplicator'
```

Then add this handler immediately after the `'git:clone'` handler block (it returns at `return cloneRepo(url, full)`):

```ts
    // -----------------------------------------------------------------------
    // project:duplicate — copy an on-disk project into <targetRoot>/<name>
    // -----------------------------------------------------------------------
    'project:duplicate': async (req) => {
      const obj = requireObject(req, 'req')
      const sourcePath = requireString(obj['sourcePath'], 'sourcePath')
      const targetRoot = requireString(obj['targetRoot'], 'targetRoot')
      const name = requireString(obj['name'], 'name')
      const mode = requireString(obj['mode'], 'mode')
      if (mode !== 'git' && mode !== 'copy') {
        return { ok: false, error: 'Invalid copy mode.' }
      }

      // Target root must be one of the configured source roots.
      const config = await loadConfig(configPath)
      const resolvedTarget = path.resolve(targetRoot)
      const isConfiguredRoot = (config.roots ?? []).some(
        (r) => path.resolve(r).toLowerCase() === resolvedTarget.toLowerCase(),
      )
      if (!isConfiguredRoot) {
        return { ok: false, error: 'Target root is not a configured source root.' }
      }

      const validation = validateCloneName(name)
      if (!validation.ok) {
        return { ok: false, error: validation.reason }
      }

      // Path-traversal guard: resolved target must stay within the root.
      const base = path.resolve(targetRoot)
      const full = path.resolve(targetRoot, name)
      if (full !== base && !full.startsWith(base + path.sep)) {
        return { ok: false, error: 'Invalid project name.' }
      }

      return duplicateProject({ sourcePath, targetDir: full, mode })
    },
```

- [ ] **Step 4: Run test + lint**

Run: `npx vitest run tests/main/ipc/handlers-duplicate.test.ts`
Expected: PASS (3 tests).
Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add electron/src/shared/ipc.ts electron/src/main/ipc/handlers.ts electron/tests/main/ipc/handlers-duplicate.test.ts
git commit -m "feat(ipc): add project:duplicate channel and handler"
```

---

### Task 4: Toast action button

**Files:**
- Modify: `electron/src/renderer/components/ui/Toast.tsx`
- Test: `electron/tests/renderer/components/Toast.test.tsx`

**Interfaces:**
- Produces: `showToast(message: string, variant?: ToastVariant, action?: { label: string; onClick: () => void }): void`. When `action` is present, `ToastItem` renders a button (label) before the dismiss control; clicking it fires `onClick`. Existing two-argument calls are unchanged.

- [ ] **Step 1: Write the failing test**

Create `electron/tests/renderer/components/Toast.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { ToastProvider, useToast } from '../../../src/renderer/components/ui/Toast'

function Trigger({ withAction }: { withAction: boolean }): React.ReactElement {
  const { showToast } = useToast()
  return (
    <button
      onClick={() =>
        withAction
          ? showToast('Done', 'info', { label: 'Open', onClick: () => { (globalThis as Record<string, unknown>).__opened = true } })
          : showToast('Plain', 'info')
      }
    >
      go
    </button>
  )
}

describe('Toast action', () => {
  it('renders an action button and fires its onClick', () => {
    ;(globalThis as Record<string, unknown>).__opened = false
    render(<ToastProvider><Trigger withAction /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    const action = screen.getByText('Open')
    act(() => { action.click() })
    expect((globalThis as Record<string, unknown>).__opened).toBe(true)
  })

  it('still works with no action (backward compatible)', () => {
    render(<ToastProvider><Trigger withAction={false} /></ToastProvider>)
    act(() => { screen.getByText('go').click() })
    expect(screen.getByText('Plain')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/components/Toast.test.tsx`
Expected: FAIL — no "Open" button rendered (action unsupported).

- [ ] **Step 3: Implement the action**

In `electron/src/renderer/components/ui/Toast.tsx`:

Add an action type to the `Toast` interface and the context signature:

```ts
interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  message: string
  variant: ToastVariant
  action?: ToastAction
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, action?: ToastAction) => void
}
```

Update `showToast`:

```ts
  const showToast = useCallback((message: string, variant: ToastVariant = 'error', action?: ToastAction) => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, variant, action }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])
```

In `ToastItem`, render the action button before the dismiss button:

```tsx
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick()
            onDismiss()
          }}
          className="font-semibold underline opacity-90 hover:opacity-100 flex-shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="opacity-70 hover:opacity-100 ml-1 flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/components/Toast.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/src/renderer/components/ui/Toast.tsx electron/tests/renderer/components/Toast.test.tsx
git commit -m "feat(ui): support an optional action button on toasts"
```

---

### Task 5: `DuplicateProjectDialog`

**Files:**
- Create: `electron/src/renderer/features/dialogs/DuplicateProjectDialog.tsx`
- Test: `electron/tests/renderer/features/dialogs/DuplicateProjectDialog.test.tsx`

**Interfaces:**
- Consumes: `deriveDuplicateName` (Task 1); `validateCloneName` (existing); `window.ccmc.invoke('project:duplicate', …)` (Task 3); `useToast().showToast(msg, variant, action)` (Task 4); `window.ccmc.invoke('launch:run', …)` (existing).
- Produces:
  ```ts
  interface DuplicateProjectDialogProps {
    open: boolean
    project: ProjectInfo
    projects: ProjectInfo[]
    roots: string[]
    defaultRoot: string | null
    isGitRepo: boolean
    onClose: () => void
    onRefresh: () => void
  }
  export function DuplicateProjectDialog(props: DuplicateProjectDialogProps): React.ReactElement
  ```

Behaviour:
- Mode state initialises to `'git'` when `isGitRepo`, else `'copy'`. The git radio is `disabled` when `!isGitRepo`.
- Selected root initialises to the source project's `root` if present in `roots`, else `defaultRoot ?? roots[0]`.
- Name initialises (and re-derives on root change while untouched) via `deriveDuplicateName(project.name, siblingsInSelectedRoot)`, where siblings are `projects.filter(p => p.root === selectedRoot).map(p => p.name)`.
- Name is live-validated with `validateCloneName`; invalid name or empty disables Duplicate.
- On Duplicate: invoke `project:duplicate`; on `ok`, `onRefresh()`, then `showToast('Duplicated to ' + name, 'info', { label: 'Open session', onClick: () => void window.ccmc.invoke('launch:run', { projectName: name, projectPath: result.path!, continueSession: false, recordUsage: false }) })`, then `onClose()`. On failure, show inline error.

- [ ] **Step 1: Write the failing test**

Create `electron/tests/renderer/features/dialogs/DuplicateProjectDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ToastProvider } from '../../../../src/renderer/components/ui/Toast'
import { DuplicateProjectDialog } from '../../../../src/renderer/features/dialogs/DuplicateProjectDialog'
import type { ProjectInfo } from '../../../../src/core/models'

function makeProject(name: string, root: string): ProjectInfo {
  return { name, root, path: `${root}\\${name}`, lastUsedUtc: null, flags: '', description: '' }
}

const invoke = vi.fn()
beforeEach(() => {
  invoke.mockReset()
  ;(globalThis as Record<string, unknown>).window = globalThis
  ;(globalThis as { ccmc?: unknown }).ccmc = { invoke, on: () => () => {} }
})

function renderDialog(over: Partial<React.ComponentProps<typeof DuplicateProjectDialog>> = {}) {
  const project = makeProject('app', 'C:\\Dev')
  return render(
    <ToastProvider>
      <DuplicateProjectDialog
        open
        project={project}
        projects={[project]}
        roots={['C:\\Dev']}
        defaultRoot="C:\\Dev"
        isGitRepo
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        {...over}
      />
    </ToastProvider>,
  )
}

describe('DuplicateProjectDialog', () => {
  it('prefills a free -copy name', () => {
    renderDialog()
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('app-copy')
  })

  it('bumps the default name when -copy already exists', () => {
    const project = makeProject('app', 'C:\\Dev')
    renderDialog({ project, projects: [project, makeProject('app-copy', 'C:\\Dev')] })
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('app-copy-2')
  })

  it('disables the git option for a non-repo source', () => {
    renderDialog({ isGitRepo: false })
    expect((screen.getByLabelText(/git clone/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('invokes project:duplicate with the chosen mode and name', async () => {
    invoke.mockResolvedValue({ ok: true, path: 'C:\\Dev\\app-copy' })
    const onRefresh = vi.fn()
    renderDialog({ onRefresh })
    act(() => { fireEvent.click(screen.getByText('Duplicate')) })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('project:duplicate', {
      sourcePath: 'C:\\Dev\\app', targetRoot: 'C:\\Dev', name: 'app-copy', mode: 'git',
    }))
    expect(onRefresh).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/features/dialogs/DuplicateProjectDialog.test.tsx`
Expected: FAIL — cannot resolve `DuplicateProjectDialog`.

- [ ] **Step 3: Implement the dialog**

Create `electron/src/renderer/features/dialogs/DuplicateProjectDialog.tsx`:

```tsx
/**
 * DuplicateProjectDialog — copy an on-disk project into a new folder, either as
 * a clean local `git clone` or an exact filesystem copy.
 */
import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { useToast } from '../../components/ui/Toast'
import { validateCloneName } from '../../../core/git/cloneName'
import { deriveDuplicateName } from '../../../core/projects/duplicateName'
import type { ProjectInfo } from '../../../core/models'

type Mode = 'git' | 'copy'

export interface DuplicateProjectDialogProps {
  open: boolean
  project: ProjectInfo
  projects: ProjectInfo[]
  roots: string[]
  defaultRoot: string | null
  isGitRepo: boolean
  onClose: () => void
  onRefresh: () => void
}

export function DuplicateProjectDialog({
  open,
  project,
  projects,
  roots,
  defaultRoot,
  isGitRepo,
  onClose,
  onRefresh,
}: DuplicateProjectDialogProps): React.ReactElement {
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>(isGitRepo ? 'git' : 'copy')
  const [selectedRoot, setSelectedRoot] = useState('')
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameTouchedRef = useRef(false)

  // Reset on open.
  useEffect(() => {
    if (!open) return
    setMode(isGitRepo ? 'git' : 'copy')
    const initialRoot = roots.includes(project.root) ? project.root : (defaultRoot ?? roots[0] ?? '')
    setSelectedRoot(initialRoot)
    setNameError(null)
    setBusy(false)
    setError(null)
    nameTouchedRef.current = false
  }, [open, isGitRepo, project.root, defaultRoot, roots])

  // Derive a free default name from the source name + siblings in the root.
  useEffect(() => {
    if (!open || nameTouchedRef.current || !selectedRoot) return
    const siblings = projects.filter((p) => p.root === selectedRoot).map((p) => p.name)
    setName(deriveDuplicateName(project.name, siblings))
  }, [open, selectedRoot, projects, project.name])

  // Live-validate the name.
  useEffect(() => {
    if (!name) { setNameError(null); return }
    const result = validateCloneName(name)
    setNameError(result.ok ? null : result.reason)
  }, [name])

  function handleNameChange(value: string): void {
    nameTouchedRef.current = true
    setName(value)
  }

  const isValid = !nameError && name.trim().length > 0 && !!selectedRoot

  async function handleDuplicate(): Promise<void> {
    if (!isValid || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.ccmc.invoke('project:duplicate', {
        sourcePath: project.path,
        targetRoot: selectedRoot,
        name: name.trim(),
        mode,
      })
      if (!result.ok) {
        setError(result.error ?? 'Duplicate failed')
        setBusy(false)
        return
      }
      onRefresh()
      const newPath = result.path!
      const newName = name.trim()
      showToast(`Duplicated to ${newName}`, 'info', {
        label: 'Open session',
        onClick: () => {
          void window.ccmc.invoke('launch:run', {
            projectName: newName,
            projectPath: newPath,
            continueSession: false,
            recordUsage: false,
          })
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={busy}>Cancel</Button>
      <Button variant="accent" onClick={() => void handleDuplicate()} disabled={!isValid || busy}>
        {busy ? 'Duplicating…' : 'Duplicate'}
      </Button>
    </>
  )

  const selectClass = [
    'rounded px-2 py-1.5 text-sm bg-[var(--control-fill)]',
    'border border-[var(--control-border)] text-[var(--text-primary)]',
    'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
  ].join(' ')

  return (
    <Modal open={open} title="Duplicate project" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[380px]">
        <div className="text-xs text-[var(--text-secondary)]">
          Source: <span className="text-[var(--text-primary)]">{project.name}</span>
          <div className="truncate" title={project.path}>{project.path}</div>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold text-[var(--text-primary)] mb-1">Copy method</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="dup-mode"
              aria-label="Git clone (clean)"
              checked={mode === 'git'}
              disabled={!isGitRepo}
              onChange={() => setMode('git')}
            />
            <span className={isGitRepo ? '' : 'text-[var(--text-disabled)]'}>
              Git clone (clean — tracked files + history)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="dup-mode"
              aria-label="Exact copy"
              checked={mode === 'copy'}
              onChange={() => setMode('copy')}
            />
            <span>Exact copy (everything, incl. node_modules / .env)</span>
          </label>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-[var(--text-secondary)]" htmlFor="dup-name">Name</label>
          <TextInput id="dup-name" value={name} onChange={handleNameChange} aria-label="Name" />
          {nameError && <p className="text-xs text-red-500">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-[var(--text-secondary)]" htmlFor="dup-root">Root</label>
          <select id="dup-root" aria-label="Root" className={selectClass} value={selectedRoot} onChange={(e) => setSelectedRoot(e.target.value)}>
            {roots.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
```

Note: confirm `TextInput`'s `onChange` is `(value: string) => void` (as used by `CloneRepoDialog`); if it instead passes an event, adapt `handleNameChange` accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/features/dialogs/DuplicateProjectDialog.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/src/renderer/features/dialogs/DuplicateProjectDialog.tsx electron/tests/renderer/features/dialogs/DuplicateProjectDialog.test.tsx
git commit -m "feat(renderer): add DuplicateProjectDialog"
```

---

### Task 6: Wire context menu → action → dialog host

**Files:**
- Modify: `electron/src/renderer/features/projects/projectActions.ts` (add `duplicate` kind)
- Modify: `electron/src/renderer/features/projects/ContextMenu.tsx` (add menu item)
- Modify: `electron/src/renderer/features/dialogs/useDialogs.tsx` (add `duplicate` dialog kind + render)
- Modify: `electron/src/renderer/App.tsx` (route `duplicate` action → `openDialog`)
- Test: `electron/tests/renderer/features/projects/ContextMenu.test.tsx` (add a case)

**Interfaces:**
- Consumes: `DuplicateProjectDialog` (Task 5); the `duplicate` IPC (Task 3).
- Produces: a `{ kind: 'duplicate'; project: ProjectInfo }` project action and a `{ kind: 'duplicate'; project; projects; roots; defaultRoot; isGitRepo }` dialog request.

- [ ] **Step 1: Add a failing context-menu test**

In `electron/tests/renderer/features/projects/ContextMenu.test.tsx`, add inside the existing top-level `describe`:

```tsx
  it('dispatches duplicate when "Duplicate…" is clicked', () => {
    const onAction = vi.fn()
    renderMenu({ onAction }) // use the file's existing render helper
    fireEvent.click(screen.getByText('Duplicate…'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'duplicate' }))
  })
```

If the file has no shared `renderMenu` helper, mirror an existing item test in that file (e.g. the "Rename…" test) and change the label to `Duplicate…` and the expected kind to `'duplicate'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/features/projects/ContextMenu.test.tsx`
Expected: FAIL — no "Duplicate…" item.

- [ ] **Step 3a: Add the action kind**

In `electron/src/renderer/features/projects/projectActions.ts`, add after the `move-to-root` line:

```ts
  | { kind: 'duplicate'; project: ProjectInfo }
```

- [ ] **Step 3b: Add the menu item**

In `electron/src/renderer/features/projects/ContextMenu.tsx`, add directly after the "Move to root" `MenuItem`:

```tsx
      <MenuItem label="Duplicate…"          onClick={() => dispatch({ kind: 'duplicate', project })} />
```

- [ ] **Step 3c: Add the dialog kind + render**

In `electron/src/renderer/features/dialogs/useDialogs.tsx`:

Add the import near the other dialog imports:

```ts
import { DuplicateProjectDialog } from './DuplicateProjectDialog'
```

Add to the `DialogRequest` union (after the `clone` entry):

```ts
  | { kind: 'duplicate'; project: ProjectInfo; projects: ProjectInfo[]; roots: string[]; defaultRoot: string | null; isGitRepo: boolean }
```

Add the render block next to the others (e.g. after the `clone` block):

```tsx
      {active?.kind === 'duplicate' && (
        <DuplicateProjectDialog
          open={true}
          project={active.project}
          projects={active.projects}
          roots={active.roots}
          defaultRoot={active.defaultRoot}
          isGitRepo={active.isGitRepo}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}
```

- [ ] **Step 3d: Route the action in App**

In `electron/src/renderer/App.tsx`, add a case in the `onAction` switch (near the `move-to-root` case):

```tsx
        case 'duplicate':
          openDialog({
            kind: 'duplicate',
            project: action.project,
            projects,
            roots: config?.roots ?? [],
            defaultRoot: config?.defaultRoot ?? null,
            isGitRepo: (enrichments[action.project.path]?.gitBranch ?? null) != null,
          })
          break
```

(`projects`, `config`, and `enrichments` are already in scope in this component.)

- [ ] **Step 4: Run tests + lint + typecheck via build**

Run: `npx vitest run tests/renderer/features/projects/ContextMenu.test.tsx`
Expected: PASS.
Run: `npm run build`
Expected: builds with no TypeScript errors.
Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add electron/src/renderer/features/projects/projectActions.ts electron/src/renderer/features/projects/ContextMenu.tsx electron/src/renderer/features/dialogs/useDialogs.tsx electron/src/renderer/App.tsx electron/tests/renderer/features/projects/ContextMenu.test.tsx
git commit -m "feat(renderer): wire Duplicate… from context menu to dialog"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (the prior ~1185 plus the new ones).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Manual smoke (per [[verify-electron-in-running-app]])**

Run: `npm run dev`. Right-click a git project → "Duplicate…" → keep defaults → Duplicate. Confirm: the toast appears with "Open session", the list shows `<name>-copy`, and the new folder exists on disk with a clean tree (no `node_modules`). Repeat with "Exact copy" on a non-repo folder and confirm everything (including untracked files) copied.

- [ ] **Step 4: Commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "test: verify duplicate-project end to end"
```

---

## Self-Review

- **Spec coverage:** entry point (Task 6), copy-mode toggle + git-disabled-for-non-repo (Tasks 5/6), name auto-derivation (Tasks 1/5), root select (Task 5), `project:duplicate` IPC + guards (Task 3), service git/copy dispatch (Task 2), Toast action + post-action flow (Tasks 4/5), tests (every task). The spec's "select the new project" post-action is intentionally dropped — there is no per-row selection state in the app (only the sidebar); refresh + toast covers it.
- **Placeholders:** none — every code step is complete. Two adaptation notes (TextInput onChange shape; ContextMenu test helper) are explicit fallbacks, not gaps.
- **Type consistency:** `duplicateProject({ sourcePath, targetDir, mode })` used identically in Tasks 2/3; `project:duplicate` req `{ sourcePath, targetRoot, name, mode }` identical in Tasks 3/5; `showToast(message, variant, action)` and `ToastAction { label, onClick }` consistent across Tasks 4/5.
