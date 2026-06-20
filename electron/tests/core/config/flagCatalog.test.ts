import { describe, it, expect } from 'vitest'
import { PRESETS } from '../../../src/core/config/flagCatalog'
import type { FlagPreset } from '../../../src/core/config/flagCatalog'

describe('ClaudeFlagCatalog', () => {
  it('has 7 presets', () => {
    expect(PRESETS).toHaveLength(7)
  })

  it('every preset has non-empty display, insertText, and description', () => {
    for (const p of PRESETS) {
      expect(p.display.length).toBeGreaterThan(0)
      expect(p.insertText.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    }
  })

  it('contains --model sonnet preset', () => {
    const found = PRESETS.find((p: FlagPreset) => p.insertText === '--model sonnet')
    expect(found).toBeDefined()
    expect(found!.display).toBe('--model sonnet')
  })

  it('contains --model opus preset', () => {
    const found = PRESETS.find((p: FlagPreset) => p.insertText === '--model opus')
    expect(found).toBeDefined()
  })

  it('contains --verbose preset', () => {
    const found = PRESETS.find((p: FlagPreset) => p.insertText === '--verbose')
    expect(found).toBeDefined()
  })

  it('contains --resume preset', () => {
    const found = PRESETS.find((p: FlagPreset) => p.insertText === '--resume')
    expect(found).toBeDefined()
  })

  it('contains --add-dir preset with trailing space in insertText', () => {
    const found = PRESETS.find((p: FlagPreset) => p.display === '--add-dir <path>')
    expect(found).toBeDefined()
    expect(found!.insertText).toBe('--add-dir ')
  })
})
