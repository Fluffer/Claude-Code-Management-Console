import { describe, it, expect } from 'vitest'
import { activationMessage } from '../../../src/core/claude/activationMessage'
import { deepLinkBuilder } from '../../../src/core/links/deepLinkBuilder'

describe('ActivationMessage', () => {
  it('FormatLink_ParseLink_RoundTrips', () => {
    const payload = activationMessage.formatLink(deepLinkBuilder.build('Foo', true))
    const link = activationMessage.parseLink(payload)
    expect(link).not.toBeNull()
    expect(link!.project).toBe('Foo')
    expect(link!.newSession).toBe(true)
  })

  it('ParseLink_ReturnsNullForPlainActivate', () => {
    expect(activationMessage.parseLink('ACTIVATE')).toBeNull()
  })

  it('ParseLink_ReturnsNullForGarbageAfterPrefix', () => {
    expect(activationMessage.parseLink('LINK not a uri')).toBeNull()
  })

  it('ParseLink_ReturnsNullForEmptyLink', () => {
    expect(activationMessage.parseLink('LINK ')).toBeNull()
  })

  it('ParseLink_ReturnsNullForEmptyString', () => {
    expect(activationMessage.parseLink('')).toBeNull()
  })

  it('ParseLink_ReturnsNullForNull', () => {
    expect(activationMessage.parseLink(null)).toBeNull()
  })

  it('Activate_ConstantIsCorrect', () => {
    expect(activationMessage.ACTIVATE).toBe('ACTIVATE')
  })
})
