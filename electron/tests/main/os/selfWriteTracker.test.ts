import { describe, it, expect, beforeEach } from 'vitest'
import {
  markSelfWrite,
  consumeSelfWrite,
  clearSelfWrites,
} from '../../../src/main/os/selfWriteTracker'

beforeEach(() => clearSelfWrites())

describe('selfWriteTracker', () => {
  it('reports a just-written path as our own', () => {
    markSelfWrite('C:\\data\\state.json', 1000)
    expect(consumeSelfWrite('C:\\data\\state.json', 2000, 1100)).toBe(true)
  })

  it('reports a path we never wrote as external', () => {
    expect(consumeSelfWrite('C:\\data\\config.json')).toBe(false)
  })

  it('reports a write older than the window as external', () => {
    markSelfWrite('C:\\data\\state.json', 1000)
    expect(consumeSelfWrite('C:\\data\\state.json', 2000, 5000)).toBe(false)
  })

  it('matches paths case-insensitively and ignores trailing separators', () => {
    markSelfWrite('C:\\Data\\State.json', 1000)
    expect(consumeSelfWrite('c:\\data\\state.json', 2000, 1010)).toBe(true)
  })

  it('suppresses only one echo per write', () => {
    markSelfWrite('C:\\data\\state.json', 1000)
    expect(consumeSelfWrite('C:\\data\\state.json', 2000, 1010)).toBe(true)
    // A second event for the same path is a real external edit.
    expect(consumeSelfWrite('C:\\data\\state.json', 2000, 1020)).toBe(false)
  })

  it('tracks each path independently', () => {
    markSelfWrite('C:\\data\\state.json', 1000)
    expect(consumeSelfWrite('C:\\data\\config.json', 2000, 1010)).toBe(false)
    expect(consumeSelfWrite('C:\\data\\state.json', 2000, 1010)).toBe(true)
  })
})
