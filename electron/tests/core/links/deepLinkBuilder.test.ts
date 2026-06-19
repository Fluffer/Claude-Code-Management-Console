import { describe, it, expect } from 'vitest'
import { deepLinkBuilder } from '../../../src/core/links/deepLinkBuilder'
import { deepLinkParser } from '../../../src/core/links/deepLinkParser'

describe('DeepLinkBuilder', () => {
  it('Build_RoundTripsThroughParser', () => {
    const uri = deepLinkBuilder.build('Hotel-Search')
    const parsed = deepLinkParser.parse(uri)
    expect(parsed).not.toBeNull()
    expect(parsed!.action).toBe('launch')
    expect(parsed!.project).toBe('Hotel-Search')
    expect(parsed!.newSession).toBe(false)
  })

  it('Build_EncodesSpecialCharacters_RoundTrips', () => {
    const uri = deepLinkBuilder.build('C:\\Dev\\My App & Co')
    const parsed = deepLinkParser.parse(uri)
    expect(parsed).not.toBeNull()
    expect(parsed!.project).toBe('C:\\Dev\\My App & Co')
  })

  it('Build_NewSessionFlag_RoundTrips', () => {
    const uri = deepLinkBuilder.build('Foo', true)
    const parsed = deepLinkParser.parse(uri)
    expect(parsed!.newSession).toBe(true)
  })
})
