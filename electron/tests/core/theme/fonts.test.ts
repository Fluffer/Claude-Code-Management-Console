import { describe, it, expect } from 'vitest'
import { FONTS, resolveFontStack } from '../../../src/core/theme/fonts'
import type { FontOption } from '../../../src/core/theme/fonts'

const DEFAULT_STACK = "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"

describe('FONTS', () => {
  it('has at least one entry', () => {
    expect(FONTS.length).toBeGreaterThan(0)
  })

  it('every entry has id, name, and stack', () => {
    for (const f of FONTS) {
      expect(f.id).toBeTruthy()
      expect(f.name).toBeTruthy()
      expect(f.stack).toBeTruthy()
    }
  })

  it('contains a "default" entry with the Segoe UI Variable stack', () => {
    const def = FONTS.find((f) => f.id === 'default')
    expect(def).toBeDefined()
    expect(def!.stack).toBe(DEFAULT_STACK)
  })

  it('contains segoe, system, verdana, arial, consolas, cascadia entries', () => {
    const ids = FONTS.map((f) => f.id)
    expect(ids).toContain('segoe')
    expect(ids).toContain('system')
    expect(ids).toContain('verdana')
    expect(ids).toContain('arial')
    expect(ids).toContain('consolas')
    expect(ids).toContain('cascadia')
  })

  it('ids are unique', () => {
    const ids = FONTS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('satisfies FontOption interface (type check via assignment)', () => {
    const option: FontOption = FONTS[0]
    expect(typeof option.id).toBe('string')
    expect(typeof option.name).toBe('string')
    expect(typeof option.stack).toBe('string')
  })
})

describe('resolveFontStack', () => {
  it('returns the stack for each known id', () => {
    for (const f of FONTS) {
      expect(resolveFontStack(f.id)).toBe(f.stack)
    }
  })

  it('returns Default stack for empty string', () => {
    expect(resolveFontStack('')).toBe(DEFAULT_STACK)
  })

  it('returns Default stack for unknown id', () => {
    expect(resolveFontStack('nonexistent')).toBe(DEFAULT_STACK)
    expect(resolveFontStack('SEGOE')).toBe(DEFAULT_STACK)
  })

  it('resolves "default" to Default stack', () => {
    expect(resolveFontStack('default')).toBe(DEFAULT_STACK)
  })

  it('resolves each named font to a non-empty stack string', () => {
    const namedIds = ['segoe', 'system', 'verdana', 'arial', 'consolas', 'cascadia']
    for (const id of namedIds) {
      const stack = resolveFontStack(id)
      expect(stack).toBeTruthy()
      expect(stack.length).toBeGreaterThan(0)
    }
  })
})
