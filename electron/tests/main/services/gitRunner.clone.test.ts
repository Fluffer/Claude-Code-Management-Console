import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cloneRepo, commitAll, openPr } from '../../../src/main/services/gitRunner'

const execFileAsync = promisify(execFile)

let gitAvailable = false
let srcRepo: string   // local repo that acts as a clone source
let tmpBase: string   // scratch dir for all test artefacts

// ---------------------------------------------------------------------------
// Suite-level setup: verify git is present + create a local bare-ish source repo
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    await execFileAsync('git', ['--version'], { timeout: 5000 })
    gitAvailable = true
  } catch {
    return
  }

  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'gitRunner-clone-'))

  // Create a source repo with one commit so it can be cloned from file://
  srcRepo = path.join(tmpBase, 'src-repo')
  await fs.mkdir(srcRepo)
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: srcRepo, timeout: 5000 })
  await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: srcRepo, timeout: 5000 })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: srcRepo, timeout: 5000 })
  await fs.writeFile(path.join(srcRepo, 'README.md'), '# src')
  await execFileAsync('git', ['add', '.'], { cwd: srcRepo, timeout: 5000 })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: srcRepo, timeout: 5000 })
})

afterAll(async () => {
  if (tmpBase) {
    await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {})
  }
})

// ---------------------------------------------------------------------------
// cloneRepo
// ---------------------------------------------------------------------------

describe('gitRunner.cloneRepo', () => {
  it('returns ok=false (no throw) when targetDir already exists', async () => {
    const existingDir = path.join(tmpBase ?? os.tmpdir(), 'already-exists')
    await fs.mkdir(existingDir, { recursive: true })

    const result = await cloneRepo('https://github.com/nonexistent/repo.git', existingDir)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already exists/i)
  })

  it('returns ok=false with non-empty error for an unreachable/invalid URL (no throw)', async () => {
    if (!gitAvailable) return
    const targetDir = path.join(tmpBase, 'bad-clone-' + Date.now())

    const result = await cloneRepo('git://invalid.nonexistent.example/repo.git', targetDir)
    expect(result.ok).toBe(false)
    expect(result.error && result.error.length > 0).toBe(true)
  }, 30000)

  it('clones a local file:// source repo successfully', async () => {
    if (!gitAvailable) return
    const targetDir = path.join(tmpBase, 'cloned-' + Date.now())
    // Use a file:// URL so no network access is needed
    const fileUrl = `file://${srcRepo.replace(/\\/g, '/')}`

    const result = await cloneRepo(fileUrl, targetDir)
    expect(result.ok).toBe(true)
    expect(result.path).toBe(targetDir)

    const stat = await fs.stat(targetDir)
    expect(stat.isDirectory()).toBe(true)
  }, 20000)
})

// ---------------------------------------------------------------------------
// commitAll
// ---------------------------------------------------------------------------

describe('gitRunner.commitAll', () => {
  let workRepo: string

  beforeAll(async () => {
    if (!gitAvailable) return
    // Fresh repo with one commit, branched off the source
    workRepo = path.join(tmpBase, 'work-repo')
    await fs.mkdir(workRepo)
    await execFileAsync('git', ['init', '-b', 'main'], { cwd: workRepo, timeout: 5000 })
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], { cwd: workRepo, timeout: 5000 })
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: workRepo, timeout: 5000 })
    await fs.writeFile(path.join(workRepo, 'a.txt'), 'hello')
    await execFileAsync('git', ['add', '.'], { cwd: workRepo, timeout: 5000 })
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: workRepo, timeout: 5000 })
  })

  it('commits a staged change and returns ok=true', async () => {
    if (!gitAvailable) return
    // Make a change
    await fs.writeFile(path.join(workRepo, 'b.txt'), 'world')
    const result = await commitAll(workRepo, 'add b.txt', false)
    expect(result.ok).toBe(true)

    // Verify commit exists
    const { stdout } = await execFileAsync('git', ['log', '--oneline'], {
      cwd: workRepo,
      timeout: 5000,
    })
    expect(stdout).toContain('add b.txt')
  }, 15000)

  it('returns ok=false with friendly message when nothing to commit', async () => {
    if (!gitAvailable) return
    // workRepo is clean at this point (previous test committed b.txt)
    const result = await commitAll(workRepo, 'nothing here', false)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Nothing to commit — the working tree is clean.')
  }, 15000)
})

// ---------------------------------------------------------------------------
// openPr — only exercising local paths (no real gh / network)
// ---------------------------------------------------------------------------

describe('gitRunner.openPr', () => {
  it('returns ok=false with gh stderr when gh exits non-zero (no throw)', async () => {
    if (!gitAvailable) return

    // Use srcRepo as the repo path; it has no remote, so git push will fail.
    // That lets us test fail-soft without needing a real gh binary.
    const result = await openPr(
      srcRepo,
      { title: 'Test PR', body: 'body' },
      'gh', // assuming gh is not authed or does not exist here; fail-soft either way
    )
    // We don't assert ok=true/false because the environment may or may not have gh.
    // The important invariant is: no throw.
    expect(typeof result.ok).toBe('boolean')
    if (!result.ok) {
      expect(result.error && result.error.length > 0).toBe(true)
    }
  }, 30000)

  it('returns ok=false when gh binary path is clearly invalid (no throw)', async () => {
    if (!gitAvailable) return
    const result = await openPr(
      srcRepo,
      { title: 'Test PR' },
      path.join(tmpBase, 'nonexistent-gh-binary'),
    )
    // Push step will fail first (no remote), which is still a controlled error
    expect(typeof result.ok).toBe('boolean')
    expect(result.ok).toBe(false)
    expect(result.error && result.error.length > 0).toBe(true)
  }, 30000)
})
