import { describe, it, expect } from 'vitest'
import { remapPathKeys, remapPathList } from '../../../src/core/projects/pathRemap'

describe('remapPathKeys', () => {
  it('moves the entry to the new key, preserving its value', () => {
    const out = remapPathKeys(
      { 'C:\\Dev\\old': { lastUsed: '2026-01-01T00:00:00.000Z', flags: '--model opus' } },
      'C:\\Dev\\old',
      'C:\\Dev\\new',
    )
    expect(out).toEqual({
      'C:\\Dev\\new': { lastUsed: '2026-01-01T00:00:00.000Z', flags: '--model opus' },
    })
  })

  it('matches the old key case-insensitively', () => {
    const out = remapPathKeys({ 'c:\\dev\\OLD': 1 }, 'C:\\Dev\\old', 'C:\\Dev\\new')
    expect(out).toEqual({ 'C:\\Dev\\new': 1 })
  })

  it('ignores a trailing separator on either path', () => {
    const out = remapPathKeys({ 'C:\\Dev\\old': 1 }, 'C:\\Dev\\old\\', 'C:\\Dev\\new\\')
    expect(out).toEqual({ 'C:\\Dev\\new': 1 })
  })

  it('leaves other entries untouched and preserves their order', () => {
    const out = remapPathKeys(
      { 'C:\\Dev\\a': 1, 'C:\\Dev\\old': 2, 'C:\\Dev\\z': 3 },
      'C:\\Dev\\old',
      'C:\\Dev\\new',
    )
    expect(Object.keys(out)).toEqual(['C:\\Dev\\a', 'C:\\Dev\\new', 'C:\\Dev\\z'])
  })

  it('returns an equal map when the old key is absent', () => {
    const input = { 'C:\\Dev\\a': 1 }
    expect(remapPathKeys(input, 'C:\\Dev\\missing', 'C:\\Dev\\new')).toEqual(input)
  })

  it('handles an undefined map', () => {
    expect(remapPathKeys(undefined, 'C:\\Dev\\old', 'C:\\Dev\\new')).toEqual({})
  })

  it('does not mutate the input', () => {
    const input = { 'C:\\Dev\\old': 1 }
    remapPathKeys(input, 'C:\\Dev\\old', 'C:\\Dev\\new')
    expect(input).toEqual({ 'C:\\Dev\\old': 1 })
  })

  it('overwrites a stale entry already sitting at the new key', () => {
    const out = remapPathKeys({ 'C:\\Dev\\new': 'stale', 'C:\\Dev\\old': 'live' }, 'C:\\Dev\\old', 'C:\\Dev\\new')
    expect(out).toEqual({ 'C:\\Dev\\new': 'live' })
  })
})

describe('remapPathList', () => {
  it('replaces the old path in place, keeping order', () => {
    expect(remapPathList(['C:\\a', 'C:\\Dev\\old', 'C:\\b'], 'C:\\Dev\\old', 'C:\\Dev\\new')).toEqual([
      'C:\\a',
      'C:\\Dev\\new',
      'C:\\b',
    ])
  })

  it('matches case-insensitively and ignores trailing separators', () => {
    expect(remapPathList(['c:\\dev\\OLD\\'], 'C:\\Dev\\old', 'C:\\Dev\\new')).toEqual(['C:\\Dev\\new'])
  })

  it('leaves a list without the old path unchanged', () => {
    expect(remapPathList(['C:\\a'], 'C:\\Dev\\old', 'C:\\Dev\\new')).toEqual(['C:\\a'])
  })

  it('does not introduce a duplicate when the new path is already present', () => {
    expect(
      remapPathList(['C:\\Dev\\new', 'C:\\Dev\\old'], 'C:\\Dev\\old', 'C:\\Dev\\new'),
    ).toEqual(['C:\\Dev\\new'])
  })

  it('handles an undefined list', () => {
    expect(remapPathList(undefined, 'C:\\Dev\\old', 'C:\\Dev\\new')).toEqual([])
  })

  it('does not mutate the input', () => {
    const input = ['C:\\Dev\\old']
    remapPathList(input, 'C:\\Dev\\old', 'C:\\Dev\\new')
    expect(input).toEqual(['C:\\Dev\\old'])
  })
})
