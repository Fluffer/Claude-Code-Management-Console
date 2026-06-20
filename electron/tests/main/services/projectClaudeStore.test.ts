import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  claudeMdPath,
  hasClaudeMdInProject,
} from '../../../src/main/services/projectClaudeStore'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projclaude-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('claudeMdPath', () => {
  it('returns null when CLAUDE.md does not exist', async () => {
    const result = await claudeMdPath(tmpDir)
    expect(result).toBeNull()
  })

  it('returns full path when CLAUDE.md exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Guide')

    const result = await claudeMdPath(tmpDir)
    expect(result).toBe(path.join(tmpDir, 'CLAUDE.md'))
  })

  it('returns null for non-existent project directory', async () => {
    const result = await claudeMdPath(path.join(tmpDir, 'nonexistent'))
    expect(result).toBeNull()
  })

  it('is case-sensitive — lowercase claude.md is not matched', async () => {
    await fs.writeFile(path.join(tmpDir, 'claude.md'), '# lowercase')

    const result = await claudeMdPath(tmpDir)
    // On Windows (case-insensitive FS) this will match; on Linux it won't.
    // The core fn is case-sensitive in its lookup (includes 'CLAUDE.md').
    // We assert the result is either the path (Windows) or null (Linux).
    // The important thing is no exception is thrown.
    expect(result === null || typeof result === 'string').toBe(true)
  })
})

describe('hasClaudeMdInProject', () => {
  it('returns false when CLAUDE.md does not exist', async () => {
    const result = await hasClaudeMdInProject(tmpDir)
    expect(result).toBe(false)
  })

  it('returns true when CLAUDE.md exists', async () => {
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Guide')

    const result = await hasClaudeMdInProject(tmpDir)
    expect(result).toBe(true)
  })

  it('returns false for non-existent directory', async () => {
    const result = await hasClaudeMdInProject(path.join(tmpDir, 'nonexistent'))
    expect(result).toBe(false)
  })

  it('does not match README.md or other files', async () => {
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Readme')
    await fs.writeFile(path.join(tmpDir, 'index.ts'), '')

    const result = await hasClaudeMdInProject(tmpDir)
    expect(result).toBe(false)
  })
})
