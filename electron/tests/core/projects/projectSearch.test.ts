import { describe, it, expect } from 'vitest'
import type { ProjectInfo } from '../../../src/core/models'
import { projectMatches } from '../../../src/core/projects/projectSearch'

function make(name: string, description: string): ProjectInfo {
  return {
    name,
    root: 'C:\\Dev',
    path: `C:\\Dev\\${name}`,
    lastUsedUtc: null,
    flags: '',
    description,
  }
}

describe('ProjectSearch', () => {
  it('MatchesName_CaseInsensitive', () => {
    expect(projectMatches(make('MyApi', ''), 'myapi')).toBe(true)
  })

  it('MatchesDescription_CaseInsensitive', () => {
    expect(projectMatches(make('MyApi', 'REST backend for invoices'), 'INVOICE')).toBe(true)
  })

  it('NoMatch_ReturnsFalse', () => {
    expect(projectMatches(make('MyApi', 'REST backend'), 'frontend')).toBe(false)
  })

  it('EmptyDescription_StillMatchesName', () => {
    expect(projectMatches(make('ToolBox', ''), 'tool')).toBe(true)
  })
})
