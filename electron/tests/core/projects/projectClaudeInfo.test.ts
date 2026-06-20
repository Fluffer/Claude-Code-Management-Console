import { describe, it, expect } from 'vitest'
import { hasClaudeMd, claudeMdFilename } from '../../../src/core/projects/projectClaudeInfo'

describe('ProjectClaudeInfo', () => {
  it('HasClaudeMd_TrueWhenPresent', () => {
    const files = ['package.json', 'CLAUDE.md', 'README.md']
    expect(hasClaudeMd(files)).toBe(true)
    expect(claudeMdFilename(files)).toBe('CLAUDE.md')
  })

  it('HasClaudeMd_FalseWhenAbsent', () => {
    const files = ['package.json', 'README.md']
    expect(hasClaudeMd(files)).toBe(false)
    expect(claudeMdFilename(files)).toBeNull()
  })

  it('HasClaudeMd_FalseWhenEmpty', () => {
    expect(hasClaudeMd([])).toBe(false)
  })
})
