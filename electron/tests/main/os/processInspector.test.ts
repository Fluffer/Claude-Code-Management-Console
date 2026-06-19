import { describe, it, expect } from 'vitest'
import { createProcessInspector } from '../../../src/main/os/processInspector'
import { MacProcessInspector } from '../../../src/main/os/processInspector.mac'

describe('processInspector (Windows integration)', () => {
  it('findClaudeSessions does not throw and returns an array', async () => {
    const inspector = createProcessInspector()
    const sessions = await inspector.findClaudeSessions()
    expect(Array.isArray(sessions)).toBe(true)
  }, 20000)

  it('findAllProcesses finds the current node process by pid', async () => {
    const inspector = createProcessInspector()
    const entries = await inspector.findAllProcesses()
    const self = entries.find(e => e.pid === process.pid)
    expect(self).toBeDefined()
    expect(self!.pid).toBe(process.pid)
  }, 20000)

  it('findAllProcesses returns entries with name and pid fields', async () => {
    const inspector = createProcessInspector()
    const entries = await inspector.findAllProcesses()
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries.slice(0, 5)) {
      expect(typeof e.pid).toBe('number')
      expect(typeof e.name).toBe('string')
      expect(e.name.length).toBeGreaterThan(0)
    }
  }, 20000)
})

describe('processInspector mac stub', () => {
  it('findAllProcesses throws mac not-implemented error', async () => {
    const stub = new MacProcessInspector()
    await expect(stub.findAllProcesses()).rejects.toThrow('macOS not implemented yet')
  })

  it('findClaudeSessions throws mac not-implemented error', async () => {
    const stub = new MacProcessInspector()
    await expect(stub.findClaudeSessions()).rejects.toThrow('macOS not implemented yet')
  })
})
