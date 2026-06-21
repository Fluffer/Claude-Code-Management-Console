import { describe, it, expect } from 'vitest'
import { parseHealthSpecs } from '../../../src/core/config/mcpHealthSpec'

describe('parseHealthSpecs', () => {
  it('parses a stdio server (command + args)', () => {
    const json = JSON.stringify({ mcpServers: { git: { command: 'uvx', args: ['mcp-server-git'] } } })
    const specs = parseHealthSpecs(json)
    expect(specs).toEqual([{ name: 'git', kind: 'stdio', command: 'uvx', args: ['mcp-server-git'], url: null }])
  })

  it('parses http and sse servers (type + url)', () => {
    const json = JSON.stringify({
      mcpServers: {
        remote: { type: 'http', url: 'https://example.com/mcp' },
        stream: { type: 'sse', url: 'https://example.com/sse' },
      },
    })
    const specs = parseHealthSpecs(json)
    expect(specs.find((s) => s.name === 'remote')).toEqual({ name: 'remote', kind: 'http', command: null, args: [], url: 'https://example.com/mcp' })
    expect(specs.find((s) => s.name === 'stream')?.kind).toBe('sse')
  })

  it('marks entries with neither command nor type as unknown', () => {
    const json = JSON.stringify({ mcpServers: { weird: { foo: 'bar' } } })
    expect(parseHealthSpecs(json)[0]).toEqual({ name: 'weird', kind: 'unknown', command: null, args: [], url: null })
  })

  it('defaults missing args to an empty array and ignores non-string args', () => {
    const json = JSON.stringify({ mcpServers: { a: { command: 'x' }, b: { command: 'y', args: ['ok', 5, null] } } })
    const specs = parseHealthSpecs(json)
    expect(specs.find((s) => s.name === 'a')?.args).toEqual([])
    expect(specs.find((s) => s.name === 'b')?.args).toEqual(['ok'])
  })

  it('skips non-object entries (e.g. _comment strings) and never throws', () => {
    const json = JSON.stringify({ _comment: 'note', mcpServers: { real: { command: 'z' } } })
    const specs = parseHealthSpecs(json)
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('real')
  })

  it('returns [] for null / malformed input', () => {
    expect(parseHealthSpecs(null)).toEqual([])
    expect(parseHealthSpecs('{ not json')).toEqual([])
  })
})
