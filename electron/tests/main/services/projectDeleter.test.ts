import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { deleteProject } from '../../../src/main/services/projectDeleter'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devprojects-delete-'))
})

afterEach(async () => {
  // Clear read-only on any leftover files before cleanup
  try {
    const clearReadOnly = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) await clearReadOnly(full)
        else await fs.chmod(full, 0o666).catch(() => {})
      }
    }
    await clearReadOnly(tmpDir)
  } catch {}
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('deleteProject (permanent)', () => {
  it('deletes a directory tree including read-only files', async () => {
    // Git object/pack files are read-only; a plain recursive delete fails on them
    const proj = path.join(tmpDir, 'Proj')
    const objectsDir = path.join(proj, '.git', 'objects')
    await fs.mkdir(objectsDir, { recursive: true })
    const packFile = path.join(objectsDir, 'pack-abc.idx')
    await fs.writeFile(packFile, 'x')
    await fs.chmod(packFile, 0o444) // read-only

    await deleteProject(proj)

    const exists = await fs.access(proj).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('trims trailing path separators', async () => {
    const proj = path.join(tmpDir, 'Trail')
    await fs.mkdir(proj)

    await deleteProject(proj + path.sep)

    const exists = await fs.access(proj).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('throws when folder does not exist', async () => {
    await expect(deleteProject(path.join(tmpDir, 'nope'))).rejects.toThrow(
      /Project folder not found/,
    )
  })

  it('deletes nested subdirectory tree', async () => {
    const proj = path.join(tmpDir, 'Deep')
    await fs.mkdir(path.join(proj, 'a', 'b', 'c'), { recursive: true })
    await fs.writeFile(path.join(proj, 'a', 'b', 'file.txt'), 'content')

    await deleteProject(proj)

    const exists = await fs.access(proj).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('deletes empty directory', async () => {
    const proj = path.join(tmpDir, 'Empty')
    await fs.mkdir(proj)

    await deleteProject(proj)

    const exists = await fs.access(proj).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })
})
