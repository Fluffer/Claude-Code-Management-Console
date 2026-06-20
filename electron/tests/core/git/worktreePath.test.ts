import { describe, it, expect } from 'vitest'
import { worktreeSlug, siblingWorktreePath } from '../../../src/core/git/worktreePath'

describe('worktreeSlug', () => {
  it('replaces slashes with dashes', () => {
    expect(worktreeSlug('feat/login')).toBe('feat-login')
  })

  it('collapses repeated separators into a single dash', () => {
    expect(worktreeSlug('feat//x')).toBe('feat-x')
    expect(worktreeSlug('a/\\b')).toBe('a-b')
  })

  it('strips Windows-invalid characters', () => {
    expect(worktreeSlug('fix:bug?<>"|*')).toBe('fix-bug')
  })

  it('preserves existing single dashes', () => {
    expect(worktreeSlug('feature/ABC-123')).toBe('feature-ABC-123')
  })

  it('trims leading and trailing dashes', () => {
    expect(worktreeSlug('/lead/trail/')).toBe('lead-trail')
  })

  it('returns empty string for blank input', () => {
    expect(worktreeSlug('   ')).toBe('')
    expect(worktreeSlug('')).toBe('')
  })

  it('replaces whitespace with dashes', () => {
    expect(worktreeSlug('my feature')).toBe('my-feature')
  })
})

describe('siblingWorktreePath', () => {
  it('builds a Windows sibling path preserving backslashes', () => {
    expect(siblingWorktreePath('C:\\Dev\\Active\\myapp', 'feat/login')).toBe(
      'C:\\Dev\\Active\\myapp-feat-login',
    )
  })

  it('builds a POSIX sibling path preserving forward slashes', () => {
    expect(siblingWorktreePath('/home/me/myapp', 'feat/login')).toBe(
      '/home/me/myapp-feat-login',
    )
  })

  it('ignores trailing separators on the repo path', () => {
    expect(siblingWorktreePath('C:\\Dev\\myapp\\', 'x')).toBe('C:\\Dev\\myapp-x')
  })

  it('preserves spaces in the repo leaf name', () => {
    expect(siblingWorktreePath('C:\\Dev\\Active\\My App', 'feat/x')).toBe(
      'C:\\Dev\\Active\\My App-feat-x',
    )
  })
})
