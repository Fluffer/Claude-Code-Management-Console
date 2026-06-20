import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getWorktrees, getBranchInfo, getIsDirty, addWorktree } from '../../../src/main/services/gitRunner'
import { siblingWorktreePath } from '../../../src/core/git/worktreePath'

const execFileAsync = promisify(execFile)

let tmpDir: string
let gitAvailable = false

beforeAll(async () => {
  // Check git is available
  try {
    await execFileAsync('git', ['--version'], { timeout: 5000 })
    gitAvailable = true
  } catch {
    gitAvailable = false
    return
  }

  // Create a real temp git repo
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitRunner-'))
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: tmpDir, timeout: 5000 })
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir, timeout: 5000 })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir, timeout: 5000 })

  // Create a commit so HEAD resolves
  const readmeFile = path.join(tmpDir, 'README.md')
  await fs.writeFile(readmeFile, '# Test')
  await execFileAsync('git', ['add', '.'], { cwd: tmpDir, timeout: 5000 })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: tmpDir, timeout: 5000 })
})

afterAll(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})

describe('gitRunner.getWorktrees', () => {
  it('returns at least one worktree for a real git repo', async () => {
    if (!gitAvailable) return
    const worktrees = await getWorktrees(tmpDir)
    expect(worktrees.length).toBeGreaterThanOrEqual(1)
    expect(worktrees[0].path).toBeTruthy()
  }, 10000)

  it('returns empty array for a non-git directory', async () => {
    const nonGitDir = os.tmpdir()
    const worktrees = await getWorktrees(nonGitDir)
    expect(Array.isArray(worktrees)).toBe(true)
    // May be empty or contain entries if tmpdir happens to be in a git repo
  }, 10000)

  it('parsed worktree has branch field equal to the committed branch', async () => {
    if (!gitAvailable) return
    const worktrees = await getWorktrees(tmpDir)
    const main = worktrees.find(w => w.branch === 'main')
    expect(main).toBeDefined()
  }, 10000)
})

describe('gitRunner.addWorktree', () => {
  const createdPaths: string[] = []

  afterAll(async () => {
    for (const p of createdPaths) {
      await fs.rm(p, { recursive: true, force: true }).catch(() => {})
    }
    if (gitAvailable && tmpDir) {
      await execFileAsync('git', ['worktree', 'prune'], { cwd: tmpDir, timeout: 5000 }).catch(() => {})
    }
  })

  it('creates a new worktree + branch off HEAD in a sibling folder', async () => {
    if (!gitAvailable) return
    const branch = 'feat/wt-create'
    const expected = siblingWorktreePath(tmpDir, branch)
    createdPaths.push(expected)

    const result = await addWorktree(tmpDir, branch)
    expect(result.ok).toBe(true)
    expect(result.path).toBe(expected)

    // The folder exists and the new branch is checked out there
    const branchInThere = await getBranchInfo(expected)
    expect(branchInThere).toBe(branch)

    // The main repo now lists the new worktree
    const worktrees = await getWorktrees(tmpDir)
    expect(worktrees.some((w) => w.branch === branch)).toBe(true)
  }, 20000)

  it('fails (ok=false, error set) when the branch already exists', async () => {
    if (!gitAvailable) return
    const branch = 'feat/wt-dup'
    createdPaths.push(siblingWorktreePath(tmpDir, branch))

    const first = await addWorktree(tmpDir, branch)
    expect(first.ok).toBe(true)

    const second = await addWorktree(tmpDir, branch)
    expect(second.ok).toBe(false)
    expect(second.error && second.error.length).toBeTruthy()
  }, 20000)

  it('fails for a non-git directory', async () => {
    const fakeDir = path.join(os.tmpdir(), 'not-git-wt-' + Date.now())
    await fs.mkdir(fakeDir, { recursive: true })
    const result = await addWorktree(fakeDir, 'x')
    expect(result.ok).toBe(false)
    await fs.rm(fakeDir, { recursive: true, force: true }).catch(() => {})
  }, 20000)
})

describe('gitRunner.getBranchInfo', () => {
  it('returns branch name for a real git repo', async () => {
    if (!gitAvailable) return
    const branch = await getBranchInfo(tmpDir)
    expect(branch).toBe('main')
  }, 10000)

  it('returns null for a non-git directory', async () => {
    const fakeDir = path.join(os.tmpdir(), 'not-a-git-' + Date.now())
    await fs.mkdir(fakeDir, { recursive: true })
    const branch = await getBranchInfo(fakeDir)
    expect(branch).toBeNull()
    await fs.rm(fakeDir, { recursive: true, force: true })
  }, 10000)
})

describe('gitRunner.getIsDirty', () => {
  it('returns false for a clean repo', async () => {
    if (!gitAvailable) return
    const dirty = await getIsDirty(tmpDir)
    expect(dirty).toBe(false)
  }, 10000)

  it('returns true after modifying a tracked file', async () => {
    if (!gitAvailable) return
    const readmeFile = path.join(tmpDir, 'README.md')
    const original = await fs.readFile(readmeFile, 'utf8')
    await fs.writeFile(readmeFile, '# Modified')
    const dirty = await getIsDirty(tmpDir)
    await fs.writeFile(readmeFile, original)
    expect(dirty).toBe(true)
  }, 10000)

  it('returns null for a non-git directory', async () => {
    const fakeDir = path.join(os.tmpdir(), 'not-git-dirty-' + Date.now())
    await fs.mkdir(fakeDir, { recursive: true })
    const dirty = await getIsDirty(fakeDir)
    expect(dirty).toBeNull()
    await fs.rm(fakeDir, { recursive: true, force: true })
  }, 10000)
})
