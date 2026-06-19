import { describe, it, expect } from 'vitest'
import { parseJson, has } from '../../../src/core/config/mcpConfigReader'

describe('McpConfigReader', () => {
  it('Read_ListsServersWithTransport', () => {
    const json = JSON.stringify({
      mcpServers: {
        git: { command: 'uvx', args: ['mcp-server-git'] },
        remote: { type: 'http', url: 'https://example.com/mcp' },
      },
    })
    const servers = parseJson(json)
    expect(servers).toHaveLength(2)
    // command-based: transport = command value
    expect(servers.some(s => s.name === 'git' && s.transport === 'uvx')).toBe(true)
    // type-based: transport = type value
    expect(servers.some(s => s.name === 'remote' && s.transport === 'http')).toBe(true)
  })

  it('Read_AbsentFile_IsEmpty', () => {
    expect(parseJson(null)).toHaveLength(0)
  })

  it('Read_GarbageJson_IsEmptyNeverThrows', () => {
    expect(() => parseJson('{ not valid')).not.toThrow()
    expect(parseJson('{ not valid')).toHaveLength(0)
  })

  it('Read_NoMcpServersKey_IsEmpty', () => {
    expect(parseJson('{ "somethingElse": 1 }')).toHaveLength(0)
  })

  it('has_ReturnsTrueWhenServersPresent', () => {
    const json = JSON.stringify({ mcpServers: { git: { command: 'uvx' } } })
    expect(has(json)).toBe(true)
  })

  it('has_ReturnsFalseWhenEmpty', () => {
    expect(has(null)).toBe(false)
  })
})
