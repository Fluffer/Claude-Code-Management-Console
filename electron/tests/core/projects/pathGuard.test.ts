import { describe, it, expect } from 'vitest'
import {
  isConfiguredRoot,
  isInsideRoots,
  isWithinRoots,
} from '../../../src/core/projects/pathGuard'

const ROOTS = ['C:\\Dev\\Active', 'C:\\Dev\\Archive']

describe('isConfiguredRoot', () => {
  it('accepts an exact root', () => {
    expect(isConfiguredRoot('C:\\Dev\\Active', ROOTS)).toBe(true)
  })

  it('ignores case and trailing separators', () => {
    expect(isConfiguredRoot('c:\\dev\\active\\', ROOTS)).toBe(true)
  })

  it('rejects a project inside a root', () => {
    expect(isConfiguredRoot('C:\\Dev\\Active\\proj', ROOTS)).toBe(false)
  })

  it('rejects when there are no roots', () => {
    expect(isConfiguredRoot('C:\\Dev\\Active', [])).toBe(false)
    expect(isConfiguredRoot('C:\\Dev\\Active', null)).toBe(false)
    expect(isConfiguredRoot('C:\\Dev\\Active', undefined)).toBe(false)
  })
})

describe('isInsideRoots', () => {
  it('accepts a direct child project', () => {
    expect(isInsideRoots('C:\\Dev\\Active\\proj', ROOTS)).toBe(true)
  })

  it('accepts a nested file', () => {
    expect(isInsideRoots('C:\\Dev\\Active\\proj\\.claude\\settings.json', ROOTS)).toBe(true)
  })

  it('accepts a path under any configured root, not just the first', () => {
    expect(isInsideRoots('C:\\Dev\\Archive\\old', ROOTS)).toBe(true)
  })

  it('rejects the root itself', () => {
    expect(isInsideRoots('C:\\Dev\\Active', ROOTS)).toBe(false)
  })

  it('rejects a sibling whose name merely starts with the root name', () => {
    expect(isInsideRoots('C:\\Dev\\ActiveOther\\proj', ROOTS)).toBe(false)
  })

  it('rejects traversal that escapes the root', () => {
    expect(isInsideRoots('C:\\Dev\\Active\\proj\\..\\..\\..\\Windows\\System32', ROOTS)).toBe(false)
    expect(isInsideRoots('C:\\Dev\\Active\\..\\Secrets', ROOTS)).toBe(false)
  })

  it('accepts traversal that stays inside the root', () => {
    expect(isInsideRoots('C:\\Dev\\Active\\a\\..\\b', ROOTS)).toBe(true)
  })

  it('rejects an unrelated absolute path', () => {
    expect(isInsideRoots('C:\\Users\\peter\\.ssh\\id_rsa', ROOTS)).toBe(false)
  })

  it('ignores case', () => {
    expect(isInsideRoots('c:\\DEV\\active\\PROJ', ROOTS)).toBe(true)
  })

  it('accepts forward-slash separators', () => {
    expect(isInsideRoots('C:/Dev/Active/proj', ROOTS)).toBe(true)
  })
})

describe('isWithinRoots', () => {
  it('accepts both a root and something inside it', () => {
    expect(isWithinRoots('C:\\Dev\\Active', ROOTS)).toBe(true)
    expect(isWithinRoots('C:\\Dev\\Active\\proj', ROOTS)).toBe(true)
  })

  it('rejects anything outside every root', () => {
    expect(isWithinRoots('C:\\Windows\\System32', ROOTS)).toBe(false)
    expect(isWithinRoots('C:\\Dev', ROOTS)).toBe(false)
  })
})
