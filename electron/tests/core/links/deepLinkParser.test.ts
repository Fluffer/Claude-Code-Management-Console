import { describe, it, expect } from 'vitest'
import { deepLinkParser } from '../../../src/core/links/deepLinkParser'

describe('DeepLinkParser', () => {
  it('Parse_ExtractsProjectQuery', () => {
    const r = deepLinkParser.parse('ccmc://launch?project=Hotel-Search')
    expect(r).not.toBeNull()
    expect(r!.action).toBe('launch')
    expect(r!.project).toBe('Hotel-Search')
    expect(r!.newSession).toBe(false)
  })

  it('Parse_DecodesEncodedPathAndNewFlag', () => {
    const r = deepLinkParser.parse('ccmc://launch?project=C%3A%5CDev%5CFoo&new=true')
    expect(r).not.toBeNull()
    expect(r!.project).toBe('C:\\Dev\\Foo')
    expect(r!.newSession).toBe(true)
  })

  it('Parse_ReturnsNullOnWrongScheme', () => {
    expect(deepLinkParser.parse('https://example.com')).toBeNull()
  })

  it('Parse_ReturnsNullOnNoProject', () => {
    expect(deepLinkParser.parse('ccmc://launch')).toBeNull()
  })

  it('Parse_ReturnsNullOnNotAUri', () => {
    expect(deepLinkParser.parse('not a uri')).toBeNull()
  })

  it('Parse_ReturnsNullOnEmptyHost', () => {
    expect(deepLinkParser.parse('ccmc://?project=foo')).toBeNull()
  })
})
