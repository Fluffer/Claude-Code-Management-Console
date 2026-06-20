import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { readEnv, writeEnv } from '../../../src/main/services/envFileStore'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envFileStore-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('readEnv', () => {
  it('returns null when file is absent', async () => {
    const result = await readEnv(path.join(tmpDir, 'nonexistent.env'))
    expect(result).toBeNull()
  })

  it('returns raw file contents', async () => {
    const envPath = path.join(tmpDir, '.env')
    const content = 'API_KEY=secret\nDEBUG=true\n'
    await fs.writeFile(envPath, content, 'utf8')

    const result = await readEnv(envPath)
    expect(result).toBe(content)
  })

  it('returns empty string for empty file', async () => {
    const envPath = path.join(tmpDir, '.env')
    await fs.writeFile(envPath, '', 'utf8')

    const result = await readEnv(envPath)
    expect(result).toBe('')
  })
})

describe('writeEnv', () => {
  it('writes contents to file', async () => {
    const envPath = path.join(tmpDir, '.env')
    await writeEnv(envPath, 'FOO=bar\n')

    const result = await fs.readFile(envPath, 'utf8')
    expect(result).toBe('FOO=bar\n')
  })

  it('round-trips through read', async () => {
    const envPath = path.join(tmpDir, '.env')
    const content = '# comment\nKEY=value\nOTHER=123\n'
    await writeEnv(envPath, content)

    const result = await readEnv(envPath)
    expect(result).toBe(content)
  })

  it('overwrites existing file', async () => {
    const envPath = path.join(tmpDir, '.env')
    await writeEnv(envPath, 'OLD=data\n')
    await writeEnv(envPath, 'NEW=data\n')

    const result = await readEnv(envPath)
    expect(result).toBe('NEW=data\n')
  })

  it('writes UTF-8 without BOM', async () => {
    const envPath = path.join(tmpDir, '.env')
    await writeEnv(envPath, 'KEY=value\n')

    const buf = await fs.readFile(envPath)
    expect(buf[0]).not.toBe(0xef)
  })
})
