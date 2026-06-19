import { describe, it, expect } from 'vitest'
import { composeShellMenu } from '../../../src/core/launch/shellMenuComposer'

describe('ShellMenuComposer', () => {
  it('Compose_PinnedFirstThenRecents', () => {
    const entries = composeShellMenu({
      pinnedPaths: ['C:\\Dev\\Pin1'],
      recentPaths: ['C:\\Dev\\Rec1', 'C:\\Dev\\Rec2'],
      recentCap: 5,
    })
    expect(entries).toHaveLength(3)
    expect(entries[0].label).toBe('Pin1')
    expect(entries[0].isPinned).toBe(true)
    expect(entries[1].label).toBe('Rec1')
    expect(entries[1].isPinned).toBe(false)
  })

  it('Compose_DedupesPinnedOutOfRecents_CaseInsensitive', () => {
    const entries = composeShellMenu({
      pinnedPaths: ['C:\\Dev\\Foo'],
      recentPaths: ['c:\\dev\\foo', 'C:\\Dev\\Bar'],
      recentCap: 5,
    })
    expect(entries).toHaveLength(2)
    expect(entries[0].path).toBe('C:\\Dev\\Foo')
    expect(entries[1].label).toBe('Bar')
  })

  it('Compose_CapsRecents', () => {
    const recents = Array.from({ length: 10 }, (_, i) => `C:\\Dev\\R${i + 1}`)
    const entries = composeShellMenu({ pinnedPaths: [], recentPaths: recents, recentCap: 5 })
    expect(entries).toHaveLength(5)
    expect(entries[0].label).toBe('R1')
  })

  it('Compose_SkipsBlanksAndDuplicates_EmptyInputsYieldEmpty', () => {
    expect(composeShellMenu({ pinnedPaths: [], recentPaths: [], recentCap: 5 })).toHaveLength(0)

    const entries = composeShellMenu({
      pinnedPaths: ['', 'C:\\Dev\\A', 'C:\\Dev\\A'],
      recentPaths: ['  '],
      recentCap: 5,
    })
    expect(entries).toHaveLength(1)
  })

  it('Compose_LabelIsFolderName_TrailingSeparatorTolerated', () => {
    const entries = composeShellMenu({
      pinnedPaths: ['C:\\Dev\\My Project\\'],
      recentPaths: [],
      recentCap: 5,
    })
    expect(entries[0].label).toBe('My Project')
  })
})
