import { describe, it, expect } from 'vitest'
import type { SavedFilter } from '../../../src/core/models'
import { type ProjectFacts, filterMatches } from '../../../src/core/projects/projectFilter'

function facts(
  path = 'C:\\Dev\\Active\\Foo',
  git = true,
  claudeMd = true,
  running = false,
  pinned = false,
): ProjectFacts {
  return { path, hasGit: git, hasClaudeMd: claudeMd, isRunning: running, isPinned: pinned }
}

function filter(overrides: Partial<SavedFilter>): SavedFilter {
  return {
    name: 'test',
    pathContains: null,
    requireGit: false,
    requireClaudeMd: false,
    requireRunning: false,
    requirePinned: false,
    ...overrides,
  }
}

describe('ProjectFilter', () => {
  it('EmptyFilter_MatchesEverything', () => {
    expect(filterMatches(filter({ name: 'all' }), facts())).toBe(true)
  })

  it('PathContains_CaseInsensitive', () => {
    const f = filter({ name: 'active', pathContains: 'active' })
    expect(filterMatches(f, facts('C:\\Dev\\Active\\Foo'))).toBe(true)
    expect(filterMatches(f, facts('C:\\Dev\\Archive\\Bar'))).toBe(false)
  })

  it('RequireGit_FiltersNonGit', () => {
    const f = filter({ name: 'git', requireGit: true })
    expect(filterMatches(f, facts(undefined, true))).toBe(true)
    expect(filterMatches(f, facts(undefined, false))).toBe(false)
  })

  it('Conditions_AreAnded', () => {
    const f = filter({ name: 'ready', requireClaudeMd: true, requireRunning: true })
    expect(filterMatches(f, facts(undefined, undefined, true, true))).toBe(true)
    expect(filterMatches(f, facts(undefined, undefined, true, false))).toBe(false)
    expect(filterMatches(f, facts(undefined, undefined, false, true))).toBe(false)
  })

  it('RequireClaudeMd_FiltersWithout', () => {
    const f = filter({ name: 'md', requireClaudeMd: true })
    expect(filterMatches(f, facts(undefined, undefined, true))).toBe(true)
    expect(filterMatches(f, facts(undefined, undefined, false))).toBe(false)
  })

  it('RequirePinned_FiltersUnpinned', () => {
    const f = filter({ name: 'pins', requirePinned: true })
    expect(filterMatches(f, facts(undefined, undefined, undefined, undefined, true))).toBe(true)
    expect(filterMatches(f, facts(undefined, undefined, undefined, undefined, false))).toBe(false)
  })
})
