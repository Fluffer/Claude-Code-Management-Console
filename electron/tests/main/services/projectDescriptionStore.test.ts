import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  getProjectDescription,
  clearDescriptionCache,
} from '../../../src/main/services/projectDescriptionStore'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projdesc-'))
  clearDescriptionCache()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  clearDescriptionCache()
})

describe('getProjectDescription', () => {
  it('returns empty string when no README or CLAUDE.md', async () => {
    const result = await getProjectDescription(tmpDir)
    expect(result).toBe('')
  })

  it('extracts description from README.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# My Project\nDoes great things.')
    const result = await getProjectDescription(tmpDir)
    expect(result).toBe('Does great things.')
  })

  it('falls back to CLAUDE.md when README has no description', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# My Project')
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Guide\nBuild with care.')
    const result = await getProjectDescription(tmpDir)
    expect(result).toBe('Build with care.')
  })

  it('prefers README.md over CLAUDE.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Title\nFrom README.')
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Title\nFrom CLAUDE.')
    const result = await getProjectDescription(tmpDir)
    expect(result).toBe('From README.')
  })

  it('reads only first 4096 bytes', async () => {
    // Create a file larger than 4096 bytes; the description text appears early
    const prefix = '# Title\n'
    const desc = 'This is the description.'
    const padding = 'x'.repeat(5000)
    await fs.writeFile(path.join(tmpDir, 'README.md'), prefix + desc + '\n' + padding)
    const result = await getProjectDescription(tmpDir)
    expect(result).toBe(desc)
  })

  it('returns empty string for project directory that does not exist', async () => {
    const result = await getProjectDescription(path.join(tmpDir, 'nonexistent'))
    expect(result).toBe('')
  })

  it('returns cached result on second call with same mtime', async () => {
    const readmePath = path.join(tmpDir, 'README.md')
    await fs.writeFile(readmePath, '# Title\nCached desc.')

    const first = await getProjectDescription(tmpDir)
    const second = await getProjectDescription(tmpDir)
    expect(first).toBe('Cached desc.')
    expect(second).toBe('Cached desc.')
  })

  it('re-reads file after mtime change', async () => {
    const readmePath = path.join(tmpDir, 'README.md')
    await fs.writeFile(readmePath, '# Title\nOriginal desc.')
    const first = await getProjectDescription(tmpDir)
    expect(first).toBe('Original desc.')

    // Small delay to ensure mtime changes
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    await fs.writeFile(readmePath, '# Title\nUpdated desc.')
    clearDescriptionCache()
    const second = await getProjectDescription(tmpDir)
    expect(second).toBe('Updated desc.')
  })
})
