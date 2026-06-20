import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { writeFileAtomic, readFileUtf8 } from '../../../src/main/os/atomicFile'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atomicFile-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('writeFileAtomic', () => {
  it('produces exact UTF-8 bytes without BOM', async () => {
    const filePath = path.join(tmpDir, 'out.json')
    await writeFileAtomic(filePath, '{"hello":"world"}')

    const buf = await fs.readFile(filePath)
    // No UTF-8 BOM (0xEF 0xBB 0xBF)
    expect(buf[0]).not.toBe(0xef)
    expect(buf.toString('utf8')).toBe('{"hello":"world"}')
  })

  it('replaces a pre-existing target file', async () => {
    const filePath = path.join(tmpDir, 'existing.json')
    await fs.writeFile(filePath, 'old content', 'utf8')

    await writeFileAtomic(filePath, 'new content')

    const result = await fs.readFile(filePath, 'utf8')
    expect(result).toBe('new content')
  })

  it('leaves no .tmp file behind after successful write', async () => {
    const filePath = path.join(tmpDir, 'clean.json')
    await writeFileAtomic(filePath, 'data')

    const tmp = filePath + '.tmp'
    await expect(fs.access(tmp)).rejects.toThrow()
  })

  it('creates parent directories if missing', async () => {
    const filePath = path.join(tmpDir, 'sub', 'nested', 'file.txt')
    await writeFileAtomic(filePath, 'content')

    const result = await fs.readFile(filePath, 'utf8')
    expect(result).toBe('content')
  })

  it('preserves non-ASCII characters correctly', async () => {
    const filePath = path.join(tmpDir, 'unicode.txt')
    const content = 'Ünïcödé — 日本語 🎉'
    await writeFileAtomic(filePath, content)

    const result = await fs.readFile(filePath, 'utf8')
    expect(result).toBe(content)
  })
})

describe('readFileUtf8', () => {
  it('returns null for absent file', async () => {
    const result = await readFileUtf8(path.join(tmpDir, 'nonexistent.json'))
    expect(result).toBeNull()
  })

  it('returns file contents as string', async () => {
    const filePath = path.join(tmpDir, 'read.txt')
    await fs.writeFile(filePath, 'hello', 'utf8')

    const result = await readFileUtf8(filePath)
    expect(result).toBe('hello')
  })

  it('handles empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.txt')
    await fs.writeFile(filePath, '', 'utf8')

    const result = await readFileUtf8(filePath)
    expect(result).toBe('')
  })
})
