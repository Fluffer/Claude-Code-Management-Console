import { describe, it, expect } from 'vitest'
import { toSkillInfo } from '../../../src/core/projects/skillInfo'

describe('toSkillInfo', () => {
  it('prefers frontmatter name over directory name', () => {
    const md = '---\nname: pretty-name\ndescription: does things\n---\n'
    const info = toSkillInfo('raw-dir', md)
    expect(info.name).toBe('pretty-name')
    expect(info.description).toBe('does things')
  })

  it('falls back to directory name when frontmatter name is absent', () => {
    expect(toSkillInfo('my-skill', '# body only').name).toBe('my-skill')
  })

  it('falls back to directory name when content is null', () => {
    const info = toSkillInfo('orphan', null)
    expect(info.name).toBe('orphan')
    expect(info.description).toBeNull()
  })
})
