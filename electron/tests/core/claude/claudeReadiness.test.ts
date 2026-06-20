import { describe, it, expect } from 'vitest'
import { isClaudeDirWritable, type ClaudeReadinessFacts } from '../../../src/core/claude/claudeReadiness'

describe('ClaudeReadiness', () => {
  it('ClaudeDirWritable_TrueWhenDirExistsAndWritable', () => {
    const facts: ClaudeReadinessFacts = { homeExists: true, claudeDirExists: true, canWrite: true }
    expect(isClaudeDirWritable(facts)).toBe(true)
  })

  it('ClaudeDirWritable_TrueWhenAbsentButHomeWritable', () => {
    const facts: ClaudeReadinessFacts = { homeExists: true, claudeDirExists: false, canWrite: true }
    expect(isClaudeDirWritable(facts)).toBe(true)
  })

  it('ClaudeDirWritable_FalseWhenHomeMissing', () => {
    const facts: ClaudeReadinessFacts = { homeExists: false, claudeDirExists: false, canWrite: false }
    expect(isClaudeDirWritable(facts)).toBe(false)
  })
})
