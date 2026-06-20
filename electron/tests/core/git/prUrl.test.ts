import { describe, it, expect } from 'vitest'
import { parsePrUrl } from '../../../src/core/git/prUrl'

describe('parsePrUrl', () => {
  it('extracts a PR URL from clean gh output', () => {
    const stdout = 'https://github.com/me/repo/pull/42\n'
    expect(parsePrUrl(stdout)).toBe('https://github.com/me/repo/pull/42')
  })

  it('returns null for an empty string', () => {
    expect(parsePrUrl('')).toBeNull()
  })

  it('returns null for unrelated output', () => {
    expect(parsePrUrl('error: something went wrong\nno url here')).toBeNull()
  })

  it('picks the first URL when multiple are present', () => {
    const stdout =
      'Creating pull request...\n' +
      'https://github.com/me/repo/pull/1\n' +
      'https://github.com/me/repo/pull/2\n'
    expect(parsePrUrl(stdout)).toBe('https://github.com/me/repo/pull/1')
  })

  it('tolerates surrounding text on the same line', () => {
    const stdout = 'View your pull request at: https://github.com/org/project/pull/99 (draft)'
    expect(parsePrUrl(stdout)).toBe('https://github.com/org/project/pull/99')
  })

  it('handles a trailing newline on the URL line', () => {
    const stdout = '\nhttps://github.com/me/repo/pull/7\n'
    expect(parsePrUrl(stdout)).toBe('https://github.com/me/repo/pull/7')
  })

  it('ignores non-github.com URLs', () => {
    const stdout = 'https://gitlab.com/me/repo/pull/5\nhttps://bitbucket.org/me/repo/pull/3'
    expect(parsePrUrl(stdout)).toBeNull()
  })

  it('ignores github.com URLs that are not pull URLs', () => {
    const stdout = 'https://github.com/me/repo/issues/10'
    expect(parsePrUrl(stdout)).toBeNull()
  })

  it('matches a PR URL with a multi-digit number', () => {
    expect(parsePrUrl('https://github.com/owner/my-repo/pull/1234')).toBe(
      'https://github.com/owner/my-repo/pull/1234',
    )
  })
})
