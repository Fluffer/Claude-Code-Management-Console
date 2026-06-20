import { describe, it, expect } from 'vitest'
import { extractDeepLinkArg } from '../../../src/core/links/deepLinkArg'

describe('extractDeepLinkArg', () => {
  it('EmptyArgv_ReturnsNull', () => {
    expect(extractDeepLinkArg([])).toBeNull()
  })

  it('NoSchemeArgs_ReturnsNull', () => {
    expect(extractDeepLinkArg(['node', 'app.js', '--flag'])).toBeNull()
  })

  it('FirstSchemeArg_Returned', () => {
    const result = extractDeepLinkArg(['node', 'app.js', 'ccmc://launch?project=Foo'])
    expect(result).toBe('ccmc://launch?project=Foo')
  })

  it('ReturnsFirst_IgnoresSubsequent', () => {
    const result = extractDeepLinkArg([
      'ccmc://launch?project=First',
      'ccmc://launch?project=Second',
    ])
    expect(result).toBe('ccmc://launch?project=First')
  })

  it('CaseInsensitiveScheme_UPPER', () => {
    const result = extractDeepLinkArg(['CCMC://launch?project=Foo'])
    expect(result).toBe('CCMC://launch?project=Foo')
  })

  it('CaseInsensitiveScheme_Mixed', () => {
    const result = extractDeepLinkArg(['Ccmc://launch?project=Bar'])
    expect(result).toBe('Ccmc://launch?project=Bar')
  })

  it('EmptyStringArgs_Skipped', () => {
    expect(extractDeepLinkArg(['', '   ', 'ccmc://launch?project=X'])).toBe(
      'ccmc://launch?project=X',
    )
  })

  it('WhitespaceOnlyArgs_Skipped', () => {
    expect(extractDeepLinkArg(['  ', '\t'])).toBeNull()
  })

  it('ArgWithLeadingWhitespace_Trimmed', () => {
    const result = extractDeepLinkArg(['  ccmc://launch?project=Trimmed  '])
    expect(result).toBe('ccmc://launch?project=Trimmed')
  })

  it('NonSchemeArgBeforeScheme_Ignored', () => {
    const result = extractDeepLinkArg(['--some-flag', 'ccmc://launch?project=Z'])
    expect(result).toBe('ccmc://launch?project=Z')
  })
})
