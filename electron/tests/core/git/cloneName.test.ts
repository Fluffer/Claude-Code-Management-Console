import { describe, it, expect } from 'vitest'
import { deriveCloneName, validateCloneName } from '../../../src/core/git/cloneName'

describe('deriveCloneName', () => {
  it('strips .git suffix from an HTTPS URL', () => {
    expect(deriveCloneName('https://github.com/me/foo.git')).toBe('foo')
  })

  it('returns the last segment when no .git suffix', () => {
    expect(deriveCloneName('https://github.com/me/foo')).toBe('foo')
  })

  it('handles scp-style SSH URL', () => {
    expect(deriveCloneName('git@github.com:me/foo.git')).toBe('foo')
  })

  it('strips trailing slash before taking the segment', () => {
    expect(deriveCloneName('https://github.com/me/foo/')).toBe('foo')
  })

  it('strips .git only from the final segment', () => {
    expect(deriveCloneName('https://github.com/me/foo.git/')).toBe('foo')
  })

  it('returns empty string for an empty input', () => {
    expect(deriveCloneName('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(deriveCloneName('   ')).toBe('')
  })

  it('handles a URL with multiple trailing slashes', () => {
    expect(deriveCloneName('https://github.com/me/bar///')).toBe('bar')
  })

  it('scp-style SSH URL without .git', () => {
    expect(deriveCloneName('git@github.com:me/foo')).toBe('foo')
  })

  it('returns empty string when the derived segment is "." (hostile URL)', () => {
    expect(deriveCloneName('https://x/../')).toBe('')
  })
})

describe('validateCloneName', () => {
  it('accepts a normal name', () => {
    expect(validateCloneName('my-project')).toEqual({ ok: true })
  })

  it('accepts a name with dots and underscores', () => {
    expect(validateCloneName('my_project.v2')).toEqual({ ok: true })
  })

  it('rejects an empty string', () => {
    const result = validateCloneName('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBeTruthy()
  })

  it('rejects a whitespace-only string', () => {
    const result = validateCloneName('   ')
    expect(result.ok).toBe(false)
  })

  it('rejects a name containing a forward slash', () => {
    const result = validateCloneName('foo/bar')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/path separator/i)
  })

  it('rejects a name containing a backslash', () => {
    const result = validateCloneName('foo\\bar')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/path separator/i)
  })

  it('rejects a name containing <', () => {
    expect(validateCloneName('foo<bar').ok).toBe(false)
  })

  it('rejects a name containing >', () => {
    expect(validateCloneName('foo>bar').ok).toBe(false)
  })

  it('rejects a name containing :', () => {
    expect(validateCloneName('foo:bar').ok).toBe(false)
  })

  it('rejects a name containing "', () => {
    expect(validateCloneName('foo"bar').ok).toBe(false)
  })

  it('rejects a name containing |', () => {
    expect(validateCloneName('foo|bar').ok).toBe(false)
  })

  it('rejects a name containing ?', () => {
    expect(validateCloneName('foo?bar').ok).toBe(false)
  })

  it('rejects a name containing *', () => {
    expect(validateCloneName('foo*bar').ok).toBe(false)
  })

  it('rejects "." (current directory)', () => {
    const result = validateCloneName('.')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/traversal/i)
  })

  it('rejects ".." (parent directory)', () => {
    const result = validateCloneName('..')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/traversal/i)
  })

  it('rejects Windows reserved name "con" (lowercase)', () => {
    const result = validateCloneName('con')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/reserved/i)
  })

  it('rejects Windows reserved name "CON" (uppercase)', () => {
    expect(validateCloneName('CON').ok).toBe(false)
  })

  it('rejects Windows reserved name "Com1"', () => {
    expect(validateCloneName('Com1').ok).toBe(false)
  })

  it('rejects Windows reserved name "lpt9"', () => {
    expect(validateCloneName('lpt9').ok).toBe(false)
  })

  it('rejects a name ending with a trailing dot', () => {
    const result = validateCloneName('foo.')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/dot or a space/i)
  })

  it('rejects a name ending with a trailing space', () => {
    const result = validateCloneName('foo ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/dot or a space/i)
  })

  it('accepts a normal project name', () => {
    expect(validateCloneName('my-project')).toEqual({ ok: true })
  })

  it('accepts a name with an interior dot (e.g. my.project)', () => {
    expect(validateCloneName('my.project')).toEqual({ ok: true })
  })
})
