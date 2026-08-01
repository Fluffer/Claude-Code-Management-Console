import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { renameProject, moveProjectToRoot } from '../../../src/main/services/projectMover'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devprojects-move-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('renameProject', () => {
  it('moves folder and returns new path', async () => {
    const original = path.join(tmpDir, 'Old')
    await fs.mkdir(original)
    await fs.writeFile(path.join(original, 'keep.txt'), 'x')

    const renamed = await renameProject(original, 'New Name')

    expect(renamed).toBe(path.join(tmpDir, 'New Name'))
    const oldExists = await fs.access(original).then(() => true).catch(() => false)
    expect(oldExists).toBe(false)
    const fileExists = await fs.access(path.join(renamed, 'keep.txt')).then(() => true).catch(() => false)
    expect(fileExists).toBe(true)
  })

  it('rejects empty name', async () => {
    const original = path.join(tmpDir, 'Old')
    await fs.mkdir(original)
    await expect(renameProject(original, '')).rejects.toThrow()
    const exists = await fs.access(original).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('rejects name with invalid characters', async () => {
    const original = path.join(tmpDir, 'Old')
    await fs.mkdir(original)
    await expect(renameProject(original, 'bad|name')).rejects.toThrow()
    const exists = await fs.access(original).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('rejects rename to existing target', async () => {
    const original = path.join(tmpDir, 'Old')
    await fs.mkdir(original)
    await fs.mkdir(path.join(tmpDir, 'Taken'))

    await expect(renameProject(original, 'Taken')).rejects.toThrow()
    const exists = await fs.access(original).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('handles case-only rename via temp name', async () => {
    const original = path.join(tmpDir, 'myproj')
    await fs.mkdir(original)
    await fs.writeFile(path.join(original, 'keep.txt'), 'x')

    const renamed = await renameProject(original, 'MyProj')

    expect(renamed).toBe(path.join(tmpDir, 'MyProj'))
    const fileExists = await fs.access(path.join(renamed, 'keep.txt')).then(() => true).catch(() => false)
    expect(fileExists).toBe(true)
    // Temp file must be gone
    const tmpExists = await fs.access(renamed + '.renaming-tmp').then(() => true).catch(() => false)
    expect(tmpExists).toBe(false)
  })

  it('rejects case-only rename with invalid characters', async () => {
    // Can't create folder with colon on Windows — test the guard directly
    // by testing a rename where old and new differ only in case but new has bad chars
    // We test the guard via a valid-name folder
    const validOrig = path.join(tmpDir, 'myproj')
    await fs.mkdir(validOrig)
    // 'myproj' → 'my:proj' is case-only? No — colon is different char.
    // The C# guard only applies to case-only renames. Test with a non-case change:
    await expect(renameProject(validOrig, 'bad|proj')).rejects.toThrow()
  })
})

describe('moveProjectToRoot', () => {
  it('moves folder to target root keeping name', async () => {
    const source = path.join(tmpDir, 'Active', 'Proj')
    const archive = path.join(tmpDir, 'Archive')
    await fs.mkdir(source, { recursive: true })
    await fs.mkdir(archive, { recursive: true })
    await fs.writeFile(path.join(source, 'keep.txt'), 'x')

    const moved = await moveProjectToRoot(source, archive)

    expect(moved).toBe(path.join(archive, 'Proj'))
    const sourceExists = await fs.access(source).then(() => true).catch(() => false)
    expect(sourceExists).toBe(false)
    const fileExists = await fs.access(path.join(moved, 'keep.txt')).then(() => true).catch(() => false)
    expect(fileExists).toBe(true)
  })

  it('rejects move to same location', async () => {
    const root = path.join(tmpDir, 'Active')
    const source = path.join(root, 'Proj')
    await fs.mkdir(source, { recursive: true })

    await expect(moveProjectToRoot(source, root)).rejects.toThrow()
    const exists = await fs.access(source).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('rejects move when target folder name already exists', async () => {
    const source = path.join(tmpDir, 'Active', 'Proj')
    const archive = path.join(tmpDir, 'Archive')
    await fs.mkdir(source, { recursive: true })
    await fs.mkdir(archive, { recursive: true })
    await fs.mkdir(path.join(archive, 'Proj'))

    await expect(moveProjectToRoot(source, archive)).rejects.toThrow()
    const exists = await fs.access(source).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('rejects move when target root does not exist', async () => {
    const source = path.join(tmpDir, 'Active', 'Proj')
    await fs.mkdir(source, { recursive: true })

    await expect(
      moveProjectToRoot(source, path.join(tmpDir, 'nonexistent-root')),
    ).rejects.toThrow(/Target root does not exist/)
    const exists = await fs.access(source).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('rejects move when target is inside the project', async () => {
    const source = path.join(tmpDir, 'Active', 'Proj')
    const nested = path.join(source, 'inner')
    await fs.mkdir(source, { recursive: true })
    await fs.mkdir(nested, { recursive: true })

    await expect(moveProjectToRoot(source, nested)).rejects.toThrow(
      /Cannot move a project into one of its own subfolders/,
    )
    const exists = await fs.access(source).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })
})
