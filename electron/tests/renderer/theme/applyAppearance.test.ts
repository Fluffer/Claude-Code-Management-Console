import { describe, it, expect, beforeEach } from 'vitest'
import { applyAccent, applyFont } from '../../../src/renderer/theme/applyAppearance'
import { resolveAccentHex } from '../../../src/core/theme/accents'
import { resolveFontStack } from '../../../src/core/theme/fonts'

beforeEach(() => {
  document.documentElement.style.removeProperty('--accent')
  document.documentElement.style.removeProperty('--app-font')
})

describe('applyAccent', () => {
  it('sets --accent to the resolved hex for "default"', () => {
    applyAccent('default')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0078d4')
  })

  it('sets --accent to the resolved hex for each known accent id', () => {
    const ids = ['default', 'purple', 'teal', 'green', 'orange', 'red', 'pink']
    for (const id of ids) {
      applyAccent(id)
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(resolveAccentHex(id))
    }
  })

  it('falls back to Default hex for unknown id', () => {
    applyAccent('not-a-real-accent')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0078d4')
  })

  it('falls back to Default hex for empty string', () => {
    applyAccent('')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0078d4')
  })
})

describe('applyFont', () => {
  it('sets --app-font to the resolved stack for "default"', () => {
    applyFont('default')
    expect(document.documentElement.style.getPropertyValue('--app-font')).toBe(
      resolveFontStack('default'),
    )
  })

  it('sets --app-font to the resolved stack for each known font id', () => {
    const ids = ['default', 'segoe', 'system', 'verdana', 'arial', 'consolas', 'cascadia']
    for (const id of ids) {
      applyFont(id)
      expect(document.documentElement.style.getPropertyValue('--app-font')).toBe(resolveFontStack(id))
    }
  })

  it('falls back to Default stack for unknown id', () => {
    applyFont('not-a-real-font')
    expect(document.documentElement.style.getPropertyValue('--app-font')).toBe(
      resolveFontStack(''),
    )
  })

  it('falls back to Default stack for empty string', () => {
    applyFont('')
    expect(document.documentElement.style.getPropertyValue('--app-font')).toBe(
      resolveFontStack('default'),
    )
  })
})
