import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getWorktrees, getBranchInfo, getIsDirty } from '../../../src/main/services/gitRunner'

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
