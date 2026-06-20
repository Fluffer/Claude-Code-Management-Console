import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { readMcp } from '../../../src/main/services/mcpStore'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpStore-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('readMcp', () => {
  it('returns empty array when .mcp.json is absent', async () => {
    const result = await readMcp(tmpDir)
    expect(result).toEqual([])
  })

  it('parses a valid .mcp.json with mcpServers', async () => {
    const mcpContent = JSON.stringify({
      mcpServers: {
        'my-server': { command: 'node', args: ['server.js'] },
        'another-server': { type: 'http', url: 'http://localhost:3000' },
      },
    })
    await fs.writeFile(path.join(tmpDir, '.mcp.json'), mcpContent, 'utf8')

    const result = await readMcp(tmpDir)
    expect(result).toHaveLength(2)

    const serverNames = result.map((s) => s.name)
    expect(serverNames).toContain('my-server')
    expect(serverNames).toContain('another-server')

    const myServer = result.find((s) => s.name === 'my-server')!
    expect(myServer.transport).toBe('node')

    const anotherServer = result.find((s) => s.name === 'another-server')!
    expect(anotherServer.transport).toBe('http')
  })

  it('returns empty array for malformed JSON', async () => {
    await fs.writeFile(path.join(tmpDir, '.mcp.json'), '{ invalid json }', 'utf8')

    const result = await readMcp(tmpDir)
    expect(result).toEqual([])
  })

  it('returns empty array when mcpServers key is absent', async () => {
    await fs.writeFile(path.join(tmpDir, '.mcp.json'), '{}', 'utf8')

    const result = await readMcp(tmpDir)
    expect(result).toEqual([])
  })

  it('uses stdio as default transport when type and command are absent', async () => {
    const mcpContent = JSON.stringify({
      mcpServers: {
        'minimal-server': {},
      },
    })
    await fs.writeFile(path.join(tmpDir, '.mcp.json'), mcpContent, 'utf8')

    const result = await readMcp(tmpDir)
    expect(result).toHaveLength(1)
    expect(result[0].transport).toBe('stdio')
  })
})
