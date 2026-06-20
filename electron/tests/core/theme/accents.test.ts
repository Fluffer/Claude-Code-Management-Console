import { describe, it, expect } from 'vitest'
import { ACCENTS, resolveAccentHex } from '../../../src/core/theme/accents'
import type { AccentOption } from '../../../src/core/theme/accents'

const DEFAULT_HEX = '#0078d4'

describe('ACCENTS', () => {
  it('has at least one entry', () => {
    expect(ACCENTS.length).toBeGreaterThan(0)
  })

  it('every entry has id, name, and hex', () => {
    for (const a of ACCENTS) {
      expect(a.id).toBeTruthy()
      expect(a.name).toBeTruthy()
      expect(a.hex).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }
  })

  it('contains a "default" entry with #0078d4', () => {
    const def = ACCENTS.find((a) => a.id === 'default')
    expect(def).toBeDefined()
    expect(def!.hex).toBe(DEFAULT_HEX)
  })

  it('contains purple, teal, green, orange, red, pink entries', () => {
    const ids = ACCENTS.map((a) => a.id)
    expect(ids).toContain('purple')
    expect(ids).toContain('teal')
    expect(ids).toContain('green')
    expect(ids).toContain('orange')
    expect(ids).toContain('red')
    expect(ids).toContain('pink')
  })

  it('ids are unique', () => {
    const ids = ACCENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('satisfies AccentOption interface (type check via assignment)', () => {
    const option: AccentOption = ACCENTS[0]
    expect(typeof option.id).toBe('string')
    expect(typeof option.name).toBe('string')
    expect(typeof option.hex).toBe('string')
  })
})

describe('resolveAccentHex', () => {
  it('returns the hex for a known id', () => {
    for (const a of ACCENTS) {
      expect(resolveAccentHex(a.id)).toBe(a.hex)
    }
  })

  it('returns Default hex for empty string', () => {
    expect(resolveAccentHex('')).toBe(DEFAULT_HEX)
  })

  it('returns Default hex for unknown id', () => {
    expect(resolveAccentHex('nonexistent')).toBe(DEFAULT_HEX)
    expect(resolveAccentHex('PURPLE')).toBe(DEFAULT_HEX)
  })

  it('resolves "default" to Default hex', () => {
    expect(resolveAccentHex('default')).toBe(DEFAULT_HEX)
  })

  it('resolves each named accent to a non-empty hex', () => {
    const namedIds = ['purple', 'teal', 'green', 'orange', 'red', 'pink']
    for (const id of namedIds) {
      const hex = resolveAccentHex(id)
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
