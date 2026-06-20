import { describe, it, expect } from 'vitest'
import { toCommandInfo } from '../../../src/core/projects/commandInfo'

describe('toCommandInfo', () => {
  it('derives name from the filename without .md', () => {
    expect(toCommandInfo('review.md', null).name).toBe('review')
  })

  it('reads description from frontmatter', () => {
    const md = '---\ndescription: Run a review\n---\nbody'
    expect(toCommandInfo('review.md', md).description).toBe('Run a review')
  })

  it('description is null when absent', () => {
    expect(toCommandInfo('plain.md', '# no frontmatter').description).toBeNull()
  })

  it('handles uppercase extension', () => {
    expect(toCommandInfo('Deploy.MD', null).name).toBe('Deploy')
  })
})
