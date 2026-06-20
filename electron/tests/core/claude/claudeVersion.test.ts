import { describe, it, expect } from 'vitest'
import { parseClaudeVersion } from '../../../src/core/claude/claudeVersion'

describe('parseClaudeVersion', () => {
  it('parses a bare semver', () => {
    expect(parseClaudeVersion('1.2.3')).toBe('1.2.3')
  })

  it('parses "claude 1.2.3" prefix form', () => {
    expect(parseClaudeVersion('claude 1.2.3')).toBe('1.2.3')
  })

  it('parses "1.2.3 (Claude Code)" suffix form', () => {
    expect(parseClaudeVersion('1.2.3 (Claude Code)')).toBe('1.2.3')
  })

  it('parses npm package path form "@anthropic-ai/claude-code/1.2.3"', () => {
    expect(parseClaudeVersion('@anthropic-ai/claude-code/1.2.3')).toBe('1.2.3')
  })

  it('parses pre-release suffix "1.2.3-beta.1"', () => {
    expect(parseClaudeVersion('1.2.3-beta.1')).toBe('1.2.3-beta.1')
  })

  it('handles leading and trailing whitespace', () => {
    expect(parseClaudeVersion('  1.2.3  ')).toBe('1.2.3')
  })

  it('returns null for empty string', () => {
    expect(parseClaudeVersion('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(parseClaudeVersion('   ')).toBeNull()
  })

  it('returns null for garbage input', () => {
    expect(parseClaudeVersion('not a version')).toBeNull()
  })

  it('returns null for partial version (no patch)', () => {
    expect(parseClaudeVersion('1.2')).toBeNull()
  })
})
