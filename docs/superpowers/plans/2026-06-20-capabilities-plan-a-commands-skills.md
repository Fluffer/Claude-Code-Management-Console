# Project Capabilities — Plan A: Slash Commands + Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface per-project Claude slash commands (actionable — launch pre-filled) and skills (read-only viewer) in the GUI, sharing one frontmatter parser and the existing MCP-viewer pattern.

**Architecture:** Pure parsers in `core/` (unit-tested, never throw), thin fs services in `main/services/` (untested, mirror `mcpStore`), two new generic IPC channels plus two new fields on `projects:claudeInfo`, two new dialogs cloned from `McpViewerDialog`, wired through the existing `ProjectAction` → `useDialogs` → `ContextMenu` plumbing. Channels bind generically (`register.ts:70`) and preload is generic (`preload.ts:14`) — no preload edits.

**Tech Stack:** Electron 32, React 18, TypeScript (strict), Vitest, Tailwind. electron-vite build.

**Scope note:** This is Plan A of three. Plan B = P2 transcript browser + P4a cost. Plan C = P4b MCP health. **P0 (VS Code action) is already implemented** — verified at `projectActions.ts:29`, `ContextMenu.tsx:85`, `App.tsx:388`; no work.

**Reference design:** `docs/superpowers/specs/2026-06-20-project-capabilities-roadmap-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `electron/src/core/config/frontmatter.ts` | Pure YAML-frontmatter → flat map | Create |
| `electron/tests/core/config/frontmatter.test.ts` | Frontmatter parser tests | Create |
| `electron/src/core/models/command-info.ts` | `CommandInfo` type | Create |
| `electron/src/core/models/skill-info.ts` | `SkillInfo` type | Create |
| `electron/src/core/models/index.ts` | Re-export new models | Modify |
| `electron/src/core/projects/commandInfo.ts` | Pure `toCommandInfo` builder | Create |
| `electron/tests/core/projects/commandInfo.test.ts` | Builder tests | Create |
| `electron/src/core/projects/skillInfo.ts` | Pure `toSkillInfo` builder | Create |
| `electron/tests/core/projects/skillInfo.test.ts` | Builder tests | Create |
| `electron/src/main/services/commandStore.ts` | Read `.claude/commands/*.md` | Create |
| `electron/src/main/services/skillStore.ts` | Read `.claude/skills/*/SKILL.md` | Create |
| `electron/src/shared/ipc.ts` | Channels + claudeInfo fields | Modify |
| `electron/src/main/ipc/handlers.ts` | New handlers + claudeInfo extension | Modify |
| `electron/src/renderer/features/projects/ProjectRow.tsx` | `ProjectEnrichment` fields + badges | Modify |
| `electron/src/renderer/hooks/useProjectEnrichment.ts` | Populate new fields | Modify |
| `electron/src/renderer/features/dialogs/SkillsViewerDialog.tsx` | Read-only skills viewer | Create |
| `electron/src/renderer/features/dialogs/CommandPickerDialog.tsx` | Command launcher | Create |
| `electron/src/renderer/features/projects/projectActions.ts` | New action kinds | Modify |
| `electron/src/renderer/features/dialogs/useDialogs.tsx` | Dialog union + host | Modify |
| `electron/src/renderer/App.tsx` | Dispatch new actions | Modify |
| `electron/src/renderer/features/projects/ContextMenu.tsx` | Gated menu entries | Modify |

---

## Task 1: Frontmatter parser (shared foundation)

**Files:**
- Create: `electron/src/core/config/frontmatter.ts`
- Test: `electron/tests/core/config/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../../../src/core/config/frontmatter'

describe('parseFrontmatter', () => {
  it('extracts key:value pairs from a leading --- block', () => {
    const md = '---\nname: review\ndescription: Review the diff\n---\n# Body\ntext'
    const fm = parseFrontmatter(md)
    expect(fm['name']).toBe('review')
    expect(fm['description']).toBe('Review the diff')
  })

  it('strips matching surrounding quotes', () => {
    const md = '---\ndescription: "quoted value"\n---\n'
    expect(parseFrontmatter(md)['description']).toBe('quoted value')
  })

  it('returns empty map when content is null', () => {
    expect(parseFrontmatter(null)).toEqual({})
  })

  it('returns empty map when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\nno fm')).toEqual({})
  })

  it('returns empty map when the block is never closed', () => {
    expect(parseFrontmatter('---\nname: x\nstill open')).toEqual({})
  })

  it('tolerates a leading BOM', () => {
    expect(parseFrontmatter('﻿---\nname: y\n---\n')['name']).toBe('y')
  })

  it('skips lines without a colon', () => {
    const fm = parseFrontmatter('---\nname: z\njust-a-flag\n---\n')
    expect(fm['name']).toBe('z')
    expect(Object.keys(fm)).toEqual(['name'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/config/frontmatter.test.ts`
Expected: FAIL — "Cannot find module '../../../src/core/config/frontmatter'"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Minimal YAML-frontmatter parser for Claude capability files
 * (commands/*.md, skills/*\/SKILL.md). Extracts the leading `---` fenced
 * block into a flat key→value string map.
 *
 * Deliberately tiny: supports `key: value` lines only (no nesting, lists, or
 * multiline). Anything it can't parse is skipped. Never throws — a file with
 * no frontmatter yields an empty map, matching the defensive style of
 * mcpConfigReader.
 */
export function parseFrontmatter(md: string | null): Record<string, string> {
  const result: Record<string, string> = {}
  if (md === null) return result
  const text = md.replace(/^﻿/, '') // strip BOM
  if (!text.startsWith('---')) return result

  const lines = text.split(/\r?\n/)
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end === -1) return result

  for (let i = 1; i < end; i++) {
    const line = lines[i]
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (key === '') continue
    let value = line.slice(colon + 1).trim()
    if (
      value.length >= 2 &&
      (value[0] === '"' || value[0] === "'") &&
      value[value.length - 1] === value[0]
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/config/frontmatter.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/config/frontmatter.ts electron/tests/core/config/frontmatter.test.ts
git commit -m "feat(core): add frontmatter parser for capability files"
```

---

## Task 2: CommandInfo + SkillInfo models

**Files:**
- Create: `electron/src/core/models/command-info.ts`
- Create: `electron/src/core/models/skill-info.ts`
- Modify: `electron/src/core/models/index.ts`

- [ ] **Step 1: Create `command-info.ts`**

```ts
/** A Claude slash command discovered in <project>/.claude/commands/*.md. */
export interface CommandInfo {
  /** Invocation name without leading slash (the file basename, sans .md). */
  name: string
  /** `description:` frontmatter value, or null when absent. */
  description: string | null
}
```

- [ ] **Step 2: Create `skill-info.ts`**

```ts
/** A Claude skill discovered in <project>/.claude/skills/*\/SKILL.md. */
export interface SkillInfo {
  /** Skill name: frontmatter `name`, falling back to the directory name. */
  name: string
  /** `description:` frontmatter value, or null when absent. */
  description: string | null
}
```

- [ ] **Step 3: Add exports to `index.ts`**

Add these two lines (alphabetical placement after the `LauncherConfig` export line):

```ts
export type { CommandInfo } from './command-info'
export type { SkillInfo } from './skill-info'
```

- [ ] **Step 4: Verify it compiles**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/models/command-info.ts electron/src/core/models/skill-info.ts electron/src/core/models/index.ts
git commit -m "feat(core): add CommandInfo and SkillInfo models"
```

---

## Task 3: `toCommandInfo` pure builder

**Files:**
- Create: `electron/src/core/projects/commandInfo.ts`
- Test: `electron/tests/core/projects/commandInfo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { toCommandInfo } from '../../../src/core/projects/commandInfo'

describe('toCommandInfo', () => {
  it('derives name from the filename without .md', () => {
    expect(toCommandInfo('review.md', null).name).toBe('review')
  })

  it('reads description from frontmatter', () => {
    const md = '---\ndescription: Run a review\n---\nbody'
    expect(toCommandInfo('review.md', md).description).toBe('Run a review')
  })

  it('description is null when absent', () => {
    expect(toCommandInfo('plain.md', '# no frontmatter').description).toBeNull()
  })

  it('handles uppercase extension', () => {
    expect(toCommandInfo('Deploy.MD', null).name).toBe('Deploy')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/projects/commandInfo.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CommandInfo } from '../models'
import { parseFrontmatter } from '../config/frontmatter'

/**
 * Builds a CommandInfo from a command file's basename and content.
 * Name is the basename without the `.md` extension (the slash-command name).
 * Description comes from `description:` frontmatter when present.
 */
export function toCommandInfo(filename: string, content: string | null): CommandInfo {
  const name = filename.replace(/\.md$/i, '')
  const fm = parseFrontmatter(content)
  const description = fm['description'] ? fm['description'] : null
  return { name, description }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/projects/commandInfo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/projects/commandInfo.ts electron/tests/core/projects/commandInfo.test.ts
git commit -m "feat(core): add toCommandInfo builder"
```

---

## Task 4: `toSkillInfo` pure builder

**Files:**
- Create: `electron/src/core/projects/skillInfo.ts`
- Test: `electron/tests/core/projects/skillInfo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { toSkillInfo } from '../../../src/core/projects/skillInfo'

describe('toSkillInfo', () => {
  it('prefers frontmatter name over directory name', () => {
    const md = '---\nname: pretty-name\ndescription: does things\n---\n'
    const info = toSkillInfo('raw-dir', md)
    expect(info.name).toBe('pretty-name')
    expect(info.description).toBe('does things')
  })

  it('falls back to directory name when frontmatter name is absent', () => {
    expect(toSkillInfo('my-skill', '# body only').name).toBe('my-skill')
  })

  it('falls back to directory name when content is null', () => {
    const info = toSkillInfo('orphan', null)
    expect(info.name).toBe('orphan')
    expect(info.description).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd electron && npx vitest run tests/core/projects/skillInfo.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SkillInfo } from '../models'
import { parseFrontmatter } from '../config/frontmatter'

/**
 * Builds a SkillInfo from a skill directory name and its SKILL.md content.
 * Name prefers frontmatter `name`, falling back to the directory name.
 * Description comes from `description:` frontmatter when present.
 */
export function toSkillInfo(dirName: string, content: string | null): SkillInfo {
  const fm = parseFrontmatter(content)
  const name = fm['name'] ? fm['name'] : dirName
  const description = fm['description'] ? fm['description'] : null
  return { name, description }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd electron && npx vitest run tests/core/projects/skillInfo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add electron/src/core/projects/skillInfo.ts electron/tests/core/projects/skillInfo.test.ts
git commit -m "feat(core): add toSkillInfo builder"
```

---

## Task 5: Main-process stores (commandStore + skillStore)

**Files:**
- Create: `electron/src/main/services/commandStore.ts`
- Create: `electron/src/main/services/skillStore.ts`

These mirror `mcpStore.ts` (thin fs wrappers, no unit test — consistent with the existing service layer).

- [ ] **Step 1: Create `commandStore.ts`**

```ts
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CommandInfo } from '../../core/models'
import { toCommandInfo } from '../../core/projects/commandInfo'
import { readFileUtf8 } from '../os/atomicFile'

const COMMANDS_DIR = path.join('.claude', 'commands')

/**
 * Lists Claude slash commands in <projectPath>/.claude/commands/*.md.
 * Returns an empty array when the directory is absent. Sorted by name.
 */
export async function listCommands(projectPath: string): Promise<CommandInfo[]> {
  const dir = path.join(projectPath, COMMANDS_DIR)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const mdFiles = entries.filter((f) => f.toLowerCase().endsWith('.md'))
  const infos = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await readFileUtf8(path.join(dir, file))
      return toCommandInfo(file, content)
    }),
  )
  return infos.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 2: Create `skillStore.ts`**

```ts
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { SkillInfo } from '../../core/models'
import { toSkillInfo } from '../../core/projects/skillInfo'
import { readFileUtf8 } from '../os/atomicFile'

const SKILLS_DIR = path.join('.claude', 'skills')

/**
 * Lists Claude skills in <projectPath>/.claude/skills/*\/SKILL.md.
 * Each skill is a subdirectory containing a SKILL.md. Returns an empty array
 * when the skills directory is absent. Sorted by name.
 */
export async function listSkills(projectPath: string): Promise<SkillInfo[]> {
  const dir = path.join(projectPath, SKILLS_DIR)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs = entries.filter((e) => e.isDirectory())
  const infos = await Promise.all(
    dirs.map(async (d) => {
      const content = await readFileUtf8(path.join(dir, d.name, 'SKILL.md'))
      return toSkillInfo(d.name, content)
    }),
  )
  return infos.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add electron/src/main/services/commandStore.ts electron/src/main/services/skillStore.ts
git commit -m "feat(main): add command/skill list stores"
```

---

## Task 6: IPC contract — channels + claudeInfo fields

**Files:**
- Modify: `electron/src/shared/ipc.ts`

- [ ] **Step 1: Import the new model types**

In the import block at the top (lines 5-14), add `CommandInfo` and `SkillInfo`:

```ts
import type {
  AppState,
  CommandInfo,
  GitInfo,
  GitWorktree,
  LauncherConfig,
  McpServerInfo,
  ProjectInfo,
  RunningSession,
  SessionSummary,
  SkillInfo,
} from '../core/models'
```

- [ ] **Step 2: Add channel constants**

In the `IPC` frozen object, after the `MCP_READ: 'mcp:read',` line (ipc.ts:63), add:

```ts
  COMMANDS_LIST: 'commands:list',
  SKILLS_LIST: 'skills:list',
```

- [ ] **Step 3: Extend `projects:claudeInfo` response**

In the `IpcMap` interface, replace the `projects:claudeInfo` entry (ipc.ts:90-99) with:

```ts
  'projects:claudeInfo': {
    req: { path: string }
    res: {
      hasClaudeMd: boolean
      claudeMdFilename: string | null
      hasMcp: boolean
      hasCommands: boolean
      hasSkills: boolean
      /** Effective default model from project/user settings.json, or null. */
      defaultModel: string | null
    }
  }
```

- [ ] **Step 4: Add the new channel map entries**

In `IpcMap`, after the `'mcp:read'` entry (ipc.ts:125), add:

```ts
  'commands:list': { req: { path: string }; res: CommandInfo[] }
  'skills:list': { req: { path: string }; res: SkillInfo[] }
```

- [ ] **Step 5: Verify it compiles (expect handler error next task)**

Run: `cd electron && npx tsc --noEmit`
Expected: FAIL — `handlers.ts` `projects:claudeInfo` now missing `hasCommands`/`hasSkills`, and `commands:list`/`skills:list` handlers missing. This is expected; Task 7 fixes it.

- [ ] **Step 6: Commit**

```bash
git add electron/src/shared/ipc.ts
git commit -m "feat(ipc): add commands:list, skills:list channels and claudeInfo fields"
```

---

## Task 7: Handlers — new channels + claudeInfo extension

**Files:**
- Modify: `electron/src/main/ipc/handlers.ts`

- [ ] **Step 1: Import the stores**

After the `import { readMcp } from '../services/mcpStore'` line (handlers.ts:17), add:

```ts
import { listCommands } from '../services/commandStore'
import { listSkills } from '../services/skillStore'
```

- [ ] **Step 2: Extend the `projects:claudeInfo` handler**

Replace the handler body (handlers.ts:241-257) with:

```ts
    'projects:claudeInfo': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      const [hasClaude, mdPath, mcpServers, defaultModel, commands, skills] = await Promise.all([
        hasClaudeMdInProject(projectPath),
        claudeMdPath(projectPath),
        readMcp(projectPath),
        resolveProjectModel(projectPath, path.join(claudeDir, 'settings.json')),
        listCommands(projectPath),
        listSkills(projectPath),
      ])
      const filename = mdPath !== null ? mdPath.split(path.sep).pop() ?? null : null
      return {
        hasClaudeMd: hasClaude,
        claudeMdFilename: filename,
        hasMcp: mcpServers.length > 0,
        hasCommands: commands.length > 0,
        hasSkills: skills.length > 0,
        defaultModel,
      }
    },
```

(Note: this preserves the existing `filename` derivation using `path.sep`, matching the original split-on-separator intent.)

- [ ] **Step 3: Add the two new handlers**

After the `mcp:read` handler (handlers.ts:414, before the `terminals:detect` comment block), add:

```ts
    // -----------------------------------------------------------------------
    // commands:list
    // -----------------------------------------------------------------------
    'commands:list': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      return listCommands(projectPath)
    },

    // -----------------------------------------------------------------------
    // skills:list
    // -----------------------------------------------------------------------
    'skills:list': async (req) => {
      const obj = requireObject(req, 'req')
      const projectPath = requireString(obj['path'], 'path')
      return listSkills(projectPath)
    },
```

- [ ] **Step 4: Verify it compiles and existing tests pass**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS — TypeScript clean; existing suite green.

- [ ] **Step 5: Commit**

```bash
git add electron/src/main/ipc/handlers.ts
git commit -m "feat(main): handle commands:list, skills:list; enrich claudeInfo"
```

---

## Task 8: Enrichment — populate hasCommands / hasSkills

**Files:**
- Modify: `electron/src/renderer/features/projects/ProjectRow.tsx`
- Modify: `electron/src/renderer/hooks/useProjectEnrichment.ts`

- [ ] **Step 1: Extend the `ProjectEnrichment` type**

In `ProjectRow.tsx`, in the `ProjectEnrichment` interface (lines 13-24), add two fields after `hasMcp: boolean`:

```ts
  hasMcp: boolean
  hasCommands: boolean
  hasSkills: boolean
```

- [ ] **Step 2: Populate them in the enrichment hook**

In `useProjectEnrichment.ts`, in the `enrichment` object literal (lines 85-99), add after `hasMcp: claudeInfo.hasMcp,`:

```ts
            hasMcp: claudeInfo.hasMcp,
            hasCommands: claudeInfo.hasCommands,
            hasSkills: claudeInfo.hasSkills,
```

- [ ] **Step 3: Add discovery badges (optional visibility)**

In `ProjectRow.tsx`, find where the existing MCP badge renders (`enrichment?.hasMcp`) and add adjacent badges. The `Badge` component signature is `{ children, color?: 'accent'|'success'|'caution'|'subtle', title? }`. Insert beside the MCP badge:

```tsx
{enrichment?.hasCommands && (
  <Badge color="subtle" title="Has slash commands">cmds</Badge>
)}
{enrichment?.hasSkills && (
  <Badge color="subtle" title="Has skills">skills</Badge>
)}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS — every `ProjectEnrichment` literal now sets the new fields. If any test fixture constructs `ProjectEnrichment`, the compiler flags it; add `hasCommands: false, hasSkills: false` to those fixtures.

- [ ] **Step 5: Commit**

```bash
git add electron/src/renderer/features/projects/ProjectRow.tsx electron/src/renderer/hooks/useProjectEnrichment.ts
git commit -m "feat(renderer): enrich rows with hasCommands/hasSkills + badges"
```

---

## Task 9: SkillsViewerDialog (P3 — read-only)

**Files:**
- Create: `electron/src/renderer/features/dialogs/SkillsViewerDialog.tsx`

- [ ] **Step 1: Create the dialog (clone of `McpViewerDialog`)**

```tsx
/**
 * SkillsViewerDialog — read-only viewer for a project's Claude skills.
 * Loads <project>/.claude/skills/*\/SKILL.md via skills:list and shows each
 * skill's name + description. "Open in VS Code" opens the skills folder.
 *
 * IPC: skills:list (load), shell:openInVscode (edit affordance).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { SkillInfo, ProjectInfo } from '../../../core/models'

export interface SkillsViewerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function SkillsViewerDialog({
  open,
  project,
  onClose,
}: SkillsViewerDialogProps): React.ReactElement {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSkills([])
    setError(null)
    setLoading(true)

    void window.ccmc.invoke('skills:list', { path: project.path })
      .then((result) => {
        setSkills(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  function openFolder(): void {
    void window.ccmc.invoke('shell:openInVscode', { path: `${project.path}/.claude/skills` })
  }

  const footer = (
    <>
      <Button onClick={openFolder} variant="subtle">Open in VS Code</Button>
      <Button onClick={onClose} variant="subtle">Close</Button>
    </>
  )

  return (
    <Modal open={open} title={`Skills — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[360px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading…</p>}

        {!loading && !error && skills.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No skills configured in this project.
          </p>
        )}

        {!loading && skills.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-3 text-xs font-medium text-[var(--text-secondary)] pb-1 border-b border-[var(--divider)]">
              <span className="w-40">Skill</span>
              <span className="flex-1">Description</span>
            </div>
            {skills.map((skill) => (
              <div key={skill.name} className="flex gap-3 py-1.5 text-sm">
                <span className="w-40 font-mono text-[var(--text-primary)] truncate" title={skill.name}>
                  {skill.name}
                </span>
                <span className="flex-1 text-[var(--text-secondary)]">
                  {skill.description ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/src/renderer/features/dialogs/SkillsViewerDialog.tsx
git commit -m "feat(renderer): add read-only SkillsViewerDialog"
```

---

## Task 10: CommandPickerDialog (P1 — actionable)

**Files:**
- Create: `electron/src/renderer/features/dialogs/CommandPickerDialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
/**
 * CommandPickerDialog — lists a project's Claude slash commands and launches
 * one. Picking a command opens a fresh Claude session in the terminal with the
 * command pre-filled as the initial prompt (`/<name>`), reusing launch:run.
 *
 * IPC: commands:list (load), launch:run (act), shell:openInVscode (edit).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { CommandInfo, ProjectInfo } from '../../../core/models'

export interface CommandPickerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function CommandPickerDialog({
  open,
  project,
  onClose,
}: CommandPickerDialogProps): React.ReactElement {
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCommands([])
    setError(null)
    setLoading(true)

    void window.ccmc.invoke('commands:list', { path: project.path })
      .then((result) => {
        setCommands(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  function runCommand(name: string): void {
    void window.ccmc.invoke('launch:run', {
      projectName: project.name,
      projectPath: project.path,
      continueSession: false,
      initialPrompt: `/${name}`,
    })
    onClose()
  }

  function openFolder(): void {
    void window.ccmc.invoke('shell:openInVscode', { path: `${project.path}/.claude/commands` })
  }

  const footer = (
    <>
      <Button onClick={openFolder} variant="subtle">Open in VS Code</Button>
      <Button onClick={onClose} variant="subtle">Close</Button>
    </>
  )

  return (
    <Modal open={open} title={`Run command — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[360px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading…</p>}

        {!loading && !error && commands.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No slash commands configured in this project.
          </p>
        )}

        {!loading && commands.length > 0 && (
          <div className="flex flex-col gap-1">
            {commands.map((cmd) => (
              <button
                key={cmd.name}
                type="button"
                onClick={() => runCommand(cmd.name)}
                className="flex flex-col items-start gap-0.5 text-left px-2 py-1.5 rounded hover:bg-[var(--subtle-fill)] focus:outline-none focus:bg-[var(--subtle-fill)]"
              >
                <span className="font-mono text-sm text-[var(--text-primary)]">/{cmd.name}</span>
                {cmd.description && (
                  <span className="text-xs text-[var(--text-secondary)]">{cmd.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd electron && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add electron/src/renderer/features/dialogs/CommandPickerDialog.tsx
git commit -m "feat(renderer): add CommandPickerDialog (launch with command pre-filled)"
```

---

## Task 11: Wire actions, dialog host, dispatcher, context menu

**Files:**
- Modify: `electron/src/renderer/features/projects/projectActions.ts`
- Modify: `electron/src/renderer/features/dialogs/useDialogs.tsx`
- Modify: `electron/src/renderer/App.tsx`
- Modify: `electron/src/renderer/features/projects/ContextMenu.tsx`

- [ ] **Step 1: Add action kinds**

In `projectActions.ts`, in the `ProjectAction` union, after the `view-mcp` entry (line 33), add:

```ts
  | { kind: 'view-skills'; project: ProjectInfo }
  | { kind: 'run-command'; project: ProjectInfo }
```

- [ ] **Step 2: Extend the dialog union + imports + host**

In `useDialogs.tsx`:

(a) After the `McpViewerDialog` import (line 21), add:

```ts
import { SkillsViewerDialog } from './SkillsViewerDialog'
import { CommandPickerDialog } from './CommandPickerDialog'
```

(b) In the `DialogRequest` union, after the `view-mcp` entry (line 45), add:

```ts
  | { kind: 'view-skills'; project: ProjectInfo }
  | { kind: 'run-command'; project: ProjectInfo }
```

(c) In the host JSX, after the `view-mcp` block (lines 166-172), add:

```tsx
      {active?.kind === 'view-skills' && (
        <SkillsViewerDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'run-command' && (
        <CommandPickerDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}
```

- [ ] **Step 3: Dispatch the actions in App.tsx**

In `App.tsx`, in the action `switch`, after the `view-mcp` case (lines 252-254), add:

```ts
        case 'view-skills':
          openDialog({ kind: 'view-skills', project: action.project })
          break

        case 'run-command':
          openDialog({ kind: 'run-command', project: action.project })
          break
```

- [ ] **Step 4: Add gated context-menu entries**

In `ContextMenu.tsx`, after the `view-mcp` menu block (lines 92-94), add:

```tsx
      {enrichment?.hasCommands && (
        <MenuItem label="Run command…"        onClick={() => dispatch({ kind: 'run-command', project })} />
      )}
      {enrichment?.hasSkills && (
        <MenuItem label="View skills…"        onClick={() => dispatch({ kind: 'view-skills', project })} />
      )}
```

- [ ] **Step 5: Verify it compiles and full suite passes**

Run: `cd electron && npx tsc --noEmit && npx vitest run`
Expected: PASS — clean compile (switch is exhaustive over `ProjectAction`), existing suite green.

- [ ] **Step 6: Commit**

```bash
git add electron/src/renderer/features/projects/projectActions.ts electron/src/renderer/features/dialogs/useDialogs.tsx electron/src/renderer/App.tsx electron/src/renderer/features/projects/ContextMenu.tsx
git commit -m "feat(renderer): wire run-command + view-skills actions and menu entries"
```

---

## Task 12: Manual verification in the running app

**Files:** none (verification only)

Per the memory rule *"unit-green ≠ working; launch the app and read main-process logs"*, verify in the real app before declaring done.

- [ ] **Step 1: Build + launch**

Run: `cd electron && npm run dev` (or the project's launch command)
Expected: app window opens, no main-process errors in the console.

- [ ] **Step 2: Verify a project WITH commands/skills**

Use this repo's own `.claude` or another project that has `.claude/commands/` and `.claude/skills/`. Confirm:
- `cmds` and/or `skills` badge appears on the row.
- Right-click → "Run command…" and "View skills…" entries appear.
- "View skills…" lists skills with descriptions; "Open in VS Code" opens the skills folder.
- "Run command…" lists `/<name>` commands; clicking one opens a terminal with the command pre-filled.

- [ ] **Step 3: Verify a project WITHOUT commands/skills**

Confirm the badges and both menu entries are absent (gated by `hasCommands`/`hasSkills`).

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix(renderer): address manual-verification findings"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- P1 slash-command launcher (actionable, pre-filled) → Tasks 3, 5, 6, 7, 10, 11. ✅
- P3 skills viewer (read-only) → Tasks 4, 5, 6, 7, 9, 11. ✅
- Shared frontmatter parser → Task 1. ✅
- Open-in-VS-Code affordance (read-only + edit button) → folder-level button in Tasks 9, 10. ✅
- Enrichment fields + badges + conditional menu visibility → Tasks 8, 11. ✅
- P0 VS Code action → already shipped; documented, no task. ✅
- Security path-allowlist: new readers only *read* under a project path the user already configured as a root; no new spawn with user-supplied args (launch:run already validates flags). Consistent with existing `mcp:read`/`env:read`, which also take a project path unguarded. No new attack surface beyond the existing pattern. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `CommandInfo`/`SkillInfo` `{ name, description }` used identically across models, builders, stores, IPC, dialogs. Channel names `commands:list`/`skills:list` consistent in `IPC`, `IpcMap`, handlers, dialogs. Action kinds `run-command`/`view-skills` consistent across `ProjectAction`, `DialogRequest`, App dispatcher, ContextMenu. ✅

**Deferred to later plans:** P2 transcript browser + P4a cost (Plan B); P4b MCP health (Plan C).
