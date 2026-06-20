import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createProjectFolder } from '../../../src/main/services/projectFolderCreator'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projcreate-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('createProjectFolder', () => {
  it('creates a new folder and returns its path', async () => {
    const result = await createProjectFolder(tmpDir, 'MyProject')
    expect(result).toBe(path.join(tmpDir, 'MyProject'))

    const stat = await fs.stat(result)
    expect(stat.isDirectory()).toBe(true)
  })

  it('trims whitespace from name', async () => {
    const result = await createProjectFolder(tmpDir, '  Trimmed  ')
    expect(result).toBe(path.join(tmpDir, 'Trimmed'))

    const exists = await fs.access(result).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('throws when root does not exist', async () => {
    await expect(
      createProjectFolder(path.join(tmpDir, 'nonexistent'), 'Proj'),
    ).rejects.toThrow(/Root folder does not exist/)
  })

  it('throws for empty name', async () => {
    await expect(createProjectFolder(tmpDir, '')).rejects.toThrow(
      /Project name cannot be empty/,
    )
  })

  it('throws for name with invalid characters', async () => {
    await expect(createProjectFolder(tmpDir, 'bad|name')).rejects.toThrow(
      /invalid characters/,
    )
  })

  it('throws when target already exists', async () => {
    await fs.mkdir(path.join(tmpDir, 'Existing'))
    await expect(createProjectFolder(tmpDir, 'Existing')).rejects.toThrow(
      /already exists/,
    )
  })
})
