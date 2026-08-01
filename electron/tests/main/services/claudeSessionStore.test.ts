import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { listSessions, newestSessionUtc } from '../../../src/main/services/claudeSessionStore'
import { encodeProjectPath } from '../../../src/core/claude/sessionLister'

let claudeBase: string
let projectPath: string

beforeEach(async () => {
  claudeBase = await fs.mkdtemp(path.join(os.tmpdir(), 'claudesession-'))
  projectPath = path.join(os.tmpdir(), 'MyProject')
})

afterEach(async () => {
  await fs.rm(claudeBase, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function createSessionDir(): Promise<string> {
  const encoded = encodeProjectPath(projectPath)
  const dir = path.join(claudeBase, 'projects', encoded)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function writeSessionFile(dir: string, id: string, firstLine: string): Promise<string> {
  const filePath = path.join(dir, `${id}.jsonl`)
  await fs.writeFile(filePath, firstLine + '\n', 'utf8')
  return filePath
}

describe('listSessions', () => {
  it('returns empty array when project directory does not exist', async () => {
    const result = await listSessions(projectPath, claudeBase)
    expect(result).toEqual([])
  })

  it('returns empty array when project directory has no .jsonl files', async () => {
    const dir = await createSessionDir()
    await fs.writeFile(path.join(dir, 'other.txt'), 'x')

    const result = await listSessions(projectPath, claudeBase)
    expect(result).toEqual([])
  })

  it('lists sessions sorted newest-first', async () => {
    const dir = await createSessionDir()
    const id1 = 'aaaaaaaa-0000-0000-0000-000000000001'
    const id2 = 'aaaaaaaa-0000-0000-0000-000000000002'

    const line1 = JSON.stringify({ message: { content: 'Hello first' } })
    const line2 = JSON.stringify({ message: { content: 'Hello second' } })

    await writeSessionFile(dir, id1, line1)
    await new Promise<void>((r) => setTimeout(r, 50))
    await writeSessionFile(dir, id2, line2)

    const result = await listSessions(projectPath, claudeBase)
    expect(result).toHaveLength(2)
    // Newest file (id2) should be first
    expect(result[0].sessionId).toBe(id2)
    expect(result[0].firstUserMessage).toBe('Hello second')
    expect(result[1].sessionId).toBe(id1)
    expect(result[1].firstUserMessage).toBe('Hello first')
  })

  it('returns empty firstUserMessage for unreadable JSONL', async () => {
    const dir = await createSessionDir()
    await writeSessionFile(dir, 'bad-session', 'not-json{{{')

    const result = await listSessions(projectPath, claudeBase)
    expect(result).toHaveLength(1)
    expect(result[0].firstUserMessage).toBe('')
  })

  it('extracts text from content array format', async () => {
    const dir = await createSessionDir()
    const line = JSON.stringify({
      message: { content: [{ type: 'text', text: 'Hello array' }] },
    })
    await writeSessionFile(dir, 'array-session', line)

    const result = await listSessions(projectPath, claudeBase)
    expect(result[0].firstUserMessage).toBe('Hello array')
  })

  it('sessionId is the file stem without .jsonl', async () => {
    const dir = await createSessionDir()
    const uuid = 'deadbeef-1234-5678-9abc-def012345678'
    await writeSessionFile(dir, uuid, JSON.stringify({ message: { content: 'Hi' } }))

    const result = await listSessions(projectPath, claudeBase)
    expect(result[0].sessionId).toBe(uuid)
  })
})

describe('newestSessionUtc', () => {
  it('returns null when no sessions exist', async () => {
    const result = await newestSessionUtc(projectPath, claudeBase)
    expect(result).toBeNull()
  })

  it('returns ISO UTC string of newest session mtime', async () => {
    const dir = await createSessionDir()
    await writeSessionFile(dir, 'session-a', '{}')
    await new Promise<void>((r) => setTimeout(r, 50))
    await writeSessionFile(dir, 'session-b', '{}')

    const result = await newestSessionUtc(projectPath, claudeBase)
    expect(result).not.toBeNull()
    // Should be a valid ISO string
    const d = new Date(result!)
    expect(d.getTime()).toBeGreaterThan(0)
  })

  it('ignores non-.jsonl files', async () => {
    const dir = await createSessionDir()
    await fs.writeFile(path.join(dir, 'readme.txt'), 'x')

    const result = await newestSessionUtc(projectPath, claudeBase)
    expect(result).toBeNull()
  })
})
