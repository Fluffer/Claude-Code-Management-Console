import { describe, it, expect } from 'vitest'
import { buildJumpListCategories } from '../../../src/core/launch/jumpListModel'
import { ShellMenuEntry } from '../../../src/core/launch/shellMenuComposer'

const EXE = 'C:\\App\\ccmc.exe'

function pinned(label: string, p: string): ShellMenuEntry {
  return { label, path: p, isPinned: true }
}

function recent(label: string, p: string): ShellMenuEntry {
  return { label, path: p, isPinned: false }
}

describe('buildJumpListCategories', () => {
  it('EmptyEntries_ReturnsEmptyArray', () => {
    expect(buildJumpListCategories([], EXE)).toEqual([])
  })

  it('PinnedOnly_ReturnsPinnedCategoryOnly', () => {
    const cats = buildJumpListCategories([pinned('Alpha', 'C:\\Alpha')], EXE)
    expect(cats).toHaveLength(1)
    expect(cats[0].name).toBe('Pinned')
    expect(cats[0].items).toHaveLength(1)
  })

  it('RecentsOnly_ReturnsRecentCategoryOnly', () => {
    const cats = buildJumpListCategories([recent('Beta', 'C:\\Beta')], EXE)
    expect(cats).toHaveLength(1)
    expect(cats[0].name).toBe('Recent')
    expect(cats[0].items).toHaveLength(1)
  })

  it('Mixed_ReturnsBothCategories_PinnedFirst', () => {
    const cats = buildJumpListCategories(
      [pinned('P1', 'C:\\P1'), recent('R1', 'C:\\R1')],
      EXE,
    )
    expect(cats).toHaveLength(2)
    expect(cats[0].name).toBe('Pinned')
    expect(cats[1].name).toBe('Recent')
  })

  it('RecentsCappedAt8', () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      recent(`R${i + 1}`, `C:\\R${i + 1}`),
    )
    const cats = buildJumpListCategories(entries, EXE)
    expect(cats).toHaveLength(1)
    expect(cats[0].name).toBe('Recent')
    expect(cats[0].items).toHaveLength(8)
    expect(cats[0].items[0].title).toBe('R1')
    expect(cats[0].items[7].title).toBe('R8')
  })

  it('RecentsCap_DoesNotAffectPinned', () => {
    const entries = [
      pinned('P1', 'C:\\P1'),
      ...Array.from({ length: 10 }, (_, i) => recent(`R${i + 1}`, `C:\\R${i + 1}`)),
    ]
    const cats = buildJumpListCategories(entries, EXE)
    const pinCat = cats.find((c) => c.name === 'Pinned')!
    const recCat = cats.find((c) => c.name === 'Recent')!
    expect(pinCat.items).toHaveLength(1)
    expect(recCat.items).toHaveLength(8)
  })

  it('TaskFields_CorrectForPinned', () => {
    const cats = buildJumpListCategories([pinned('MyProject', 'C:\\Dev\\MyProject')], EXE)
    const task = cats[0].items[0]
    expect(task.type).toBe('task')
    expect(task.program).toBe(EXE)
    expect(task.title).toBe('MyProject')
    expect(task.description).toBe('Launch Claude in MyProject')
  })

  it('ArgsUseLabelNotPath_ViaDeepLinkBuilder', () => {
    const cats = buildJumpListCategories([pinned('FolderName', 'C:\\Some\\Long\\Path')], EXE)
    const task = cats[0].items[0]
    // args must encode label "FolderName", not the path
    expect(task.args).toContain('FolderName')
    expect(task.args).not.toContain('C%3A') // path should not appear
    expect(task.args).toMatch(/^ccmc:\/\/launch\?project=/)
  })

  it('ExactArgsString_MatchesDeepLinkBuilderOutput', () => {
    const cats = buildJumpListCategories([recent('Zeta', 'C:\\Zeta')], EXE)
    expect(cats[0].items[0].args).toBe('ccmc://launch?project=Zeta')
  })

  it('ExactArgsString_EncodesSpecialChars', () => {
    const cats = buildJumpListCategories([pinned('My Project', 'C:\\My Project')], EXE)
    expect(cats[0].items[0].args).toBe('ccmc://launch?project=My%20Project')
  })

  it('EmptyPinnedOmitted_WhenOnlyRecents', () => {
    const cats = buildJumpListCategories([recent('R1', 'C:\\R1')], EXE)
    expect(cats.every((c) => c.name !== 'Pinned')).toBe(true)
  })

  it('EmptyRecentOmitted_WhenOnlyPinned', () => {
    const cats = buildJumpListCategories([pinned('P1', 'C:\\P1')], EXE)
    expect(cats.every((c) => c.name !== 'Recent')).toBe(true)
  })

  it('ProgramField_IsExePath', () => {
    const exe = 'D:\\Custom\\ccmc.exe'
    const cats = buildJumpListCategories([pinned('X', 'C:\\X')], exe)
    expect(cats[0].items[0].program).toBe(exe)
  })
})
