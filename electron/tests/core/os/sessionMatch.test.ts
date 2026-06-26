import { describe, it, expect } from 'vitest'
import { sessionMatchesProject } from '../../../src/core/os/sessionMatch'
import type { RunningSession } from '../../../src/core/models'

const project = { path: 'C:\\Dev\\Active\\My Project', name: 'My Project' }

function session(partial: Partial<RunningSession>): RunningSession {
  return { pid: 1, processName: 'claude.exe', workingDirectory: '', ...partial }
}

describe('sessionMatchesProject', () => {
  it('matches on working directory (case-insensitive)', () => {
    expect(sessionMatchesProject(session({ workingDirectory: 'c:\\dev\\active\\my project' }), project)).toBe(true)
  })

  it('matches a working directory beneath the project folder', () => {
    expect(sessionMatchesProject(session({ workingDirectory: 'C:\\Dev\\Active\\My Project\\src\\core' }), project)).toBe(true)
  })

  it('does not match a sibling folder with the same prefix', () => {
    expect(sessionMatchesProject(session({ workingDirectory: 'C:\\Dev\\Active\\My Project Two' }), project)).toBe(false)
  })

  it('ignores a trailing separator on the working directory', () => {
    expect(sessionMatchesProject(session({ workingDirectory: 'C:\\Dev\\Active\\My Project\\' }), project)).toBe(true)
  })

  it('matches on session name when working directory is unknown', () => {
    expect(sessionMatchesProject(session({ sessionName: 'My Project' }), project)).toBe(true)
  })

  it('matches session name case-insensitively', () => {
    expect(sessionMatchesProject(session({ sessionName: 'my project' }), project)).toBe(true)
  })

  it('does not match a different name', () => {
    expect(sessionMatchesProject(session({ sessionName: 'Other' }), project)).toBe(false)
  })

  it('does not match when both keys are empty/absent', () => {
    expect(sessionMatchesProject(session({}), project)).toBe(false)
  })

  it('never matches an empty working directory against the project path', () => {
    expect(sessionMatchesProject(session({ workingDirectory: '' }), project)).toBe(false)
  })
})
