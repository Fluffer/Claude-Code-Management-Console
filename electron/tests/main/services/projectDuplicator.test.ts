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

  it('errors when the target is the source', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    const res = await duplicateProject({ sourcePath: src, targetDir: src, mode: 'copy' })
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

  it('detects a nested target case-insensitively', async () => {
    const src = path.join(work, 'src'); await mkdir(src)
    const res = await duplicateProject({ sourcePath: src, targetDir: path.join(src.toUpperCase(), 'inner'), mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/into itself/i)
  })
})
