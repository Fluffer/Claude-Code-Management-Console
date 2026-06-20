import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from '../../../src/core/config/frontmatter'

describe('parseFrontmatter', () => {
  it('extracts key:value pairs from a leading --- block', () => {
    const md = '---\nname: review\ndescription: Review the diff\n---\n# Body\ntext'
    const fm = parseFrontmatter(md)
    expect(fm['name']).toBe('review')
    expect(fm['description']).toBe('Review the diff')
  })

  it('strips matching surrounding quotes', () => {
    const md = '---\ndescription: "quoted value"\n---\n'
    expect(parseFrontmatter(md)['description']).toBe('quoted value')
  })

  it('returns empty map when content is null', () => {
    expect(parseFrontmatter(null)).toEqual({})
  })

  it('returns empty map when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\nno fm')).toEqual({})
  })

  it('returns empty map when the block is never closed', () => {
    expect(parseFrontmatter('---\nname: x\nstill open')).toEqual({})
  })

  it('tolerates a leading BOM', () => {
    expect(parseFrontmatter('﻿---\nname: y\n---\n')['name']).toBe('y')
  })

  it('skips lines without a colon', () => {
    const fm = parseFrontmatter('---\nname: z\njust-a-flag\n---\n')
    expect(fm['name']).toBe('z')
    expect(Object.keys(fm)).toEqual(['name'])
  })
})
