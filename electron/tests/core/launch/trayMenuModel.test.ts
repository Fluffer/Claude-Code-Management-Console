import { describe, it, expect } from 'vitest'
import { buildTrayMenuModel, TrayMenuItem } from '../../../src/core/launch/trayMenuModel'
import { ShellMenuEntry } from '../../../src/core/launch/shellMenuComposer'

function pinned(label: string, p: string): ShellMenuEntry {
  return { label, path: p, isPinned: true }
}

function recent(label: string, p: string): ShellMenuEntry {
  return { label, path: p, isPinned: false }
}

function kinds(items: TrayMenuItem[]): string[] {
  return items.map((i) => i.kind)
}

describe('buildTrayMenuModel', () => {
  it('EmptyEntries_EmitsEmptyPlaceholderThenFooter', () => {
    const items = buildTrayMenuModel([])
    expect(kinds(items)).toEqual(['empty', 'separator', 'open', 'exit'])
    const empty = items[0] as { kind: 'empty'; label: string }
    expect(empty.label).toBe('No recent projects')
  })

  it('PinnedOnly_NoSeparatorBetweenPinnedAndFooter', () => {
    const items = buildTrayMenuModel([pinned('Pin1', 'C:\\Dev\\Pin1')])
    expect(kinds(items)).toEqual(['project', 'separator', 'open', 'exit'])
  })

  it('RecentsOnly_NoSeparatorBeforeRecents', () => {
    const items = buildTrayMenuModel([
      recent('Rec1', 'C:\\Dev\\Rec1'),
      recent('Rec2', 'C:\\Dev\\Rec2'),
    ])
    expect(kinds(items)).toEqual(['project', 'project', 'separator', 'open', 'exit'])
  })

  it('MixedPinnedAndRecents_SeparatorBetweenGroups', () => {
    const items = buildTrayMenuModel([
      pinned('Pin1', 'C:\\Dev\\Pin1'),
      pinned('Pin2', 'C:\\Dev\\Pin2'),
      recent('Rec1', 'C:\\Dev\\Rec1'),
      recent('Rec2', 'C:\\Dev\\Rec2'),
    ])
    expect(kinds(items)).toEqual([
      'project',
      'project',
      'separator', // pinned→recents divider
      'project',
      'project',
      'separator', // footer separator
      'open',
      'exit',
    ])
  })

  it('DividerPosition_BeforeFirstRecent', () => {
    const items = buildTrayMenuModel([
      pinned('P1', 'C:\\P1'),
      recent('R1', 'C:\\R1'),
      recent('R2', 'C:\\R2'),
    ])
    // index 0=P1, 1=separator, 2=R1, 3=R2, 4=sep, 5=open, 6=exit
    expect(items[0]).toMatchObject({ kind: 'project', label: 'P1' })
    expect(items[1]).toMatchObject({ kind: 'separator' })
    expect(items[2]).toMatchObject({ kind: 'project', label: 'R1' })
    expect(items[3]).toMatchObject({ kind: 'project', label: 'R2' })
  })

  it('ProjectItems_CarryLabelAndPath', () => {
    const items = buildTrayMenuModel([pinned('MyProject', 'C:\\Dev\\MyProject')])
    const proj = items[0] as { kind: 'project'; label: string; path: string }
    expect(proj.label).toBe('MyProject')
    expect(proj.path).toBe('C:\\Dev\\MyProject')
  })

  it('OpenAndExit_AlwaysPresent_WithCorrectLabels', () => {
    const items = buildTrayMenuModel([])
    const open = items.find((i) => i.kind === 'open') as { kind: 'open'; label: string }
    const exit = items.find((i) => i.kind === 'exit') as { kind: 'exit'; label: string }
    expect(open.label).toBe('Open ccmc')
    expect(exit.label).toBe('Exit')
  })

  it('OpenAndExit_AlwaysPresentWithEntries', () => {
    const items = buildTrayMenuModel([pinned('P', 'C:\\P')])
    expect(items.some((i) => i.kind === 'open')).toBe(true)
    expect(items.some((i) => i.kind === 'exit')).toBe(true)
  })

  it('OnlyOneDivider_BetweenFirstPinnedAndFirstRecent', () => {
    const items = buildTrayMenuModel([
      pinned('P1', 'C:\\P1'),
      pinned('P2', 'C:\\P2'),
      recent('R1', 'C:\\R1'),
    ])
    const separators = items.filter((i) => i.kind === 'separator')
    // Only 2 separators: the divider and the footer separator
    expect(separators).toHaveLength(2)
  })
})
