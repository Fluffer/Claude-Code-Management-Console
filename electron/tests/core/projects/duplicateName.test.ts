import { describe, it, expect } from 'vitest'
import { deriveDuplicateName } from '../../../src/core/projects/duplicateName'

describe('deriveDuplicateName', () => {
  it('returns <name>-copy when no sibling collides', () => {
    expect(deriveDuplicateName('app', [])).toBe('app-copy')
    expect(deriveDuplicateName('app', ['other'])).toBe('app-copy')
  })

  it('bumps to -copy-2 when -copy already exists', () => {
    expect(deriveDuplicateName('app', ['app-copy'])).toBe('app-copy-2')
  })

  it('finds the first free suffix across multiple collisions', () => {
    expect(deriveDuplicateName('app', ['app-copy', 'app-copy-2', 'app-copy-3'])).toBe('app-copy-4')
  })

  it('compares siblings case-insensitively', () => {
    expect(deriveDuplicateName('App', ['app-COPY'])).toBe('App-copy-2')
  })

  it('handles a source name that already ends in -copy', () => {
    expect(deriveDuplicateName('app-copy', ['app-copy'])).toBe('app-copy-copy')
  })
})
