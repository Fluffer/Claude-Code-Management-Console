import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { createSessionKiller } from '../../../src/main/os/sessionKiller'
import { MacSessionKiller } from '../../../src/main/os/sessionKiller.mac'

describe('sessionKiller (Windows integration)', () => {
  it('kill returns true for a non-existent pid (already gone)', async () => {
    const killer = createSessionKiller()
    // PID 99999999 is almost certainly not a real process
    const result = await killer.kill(99999999)
    expect(result).toBe(true)
  })

  it('kill kills a spawned child process and returns true', async () => {
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(()=>{},1e9)'],
      { detached: false, stdio: 'ignore' }
    )
    const pid = child.pid!

    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 200))

    const killer = createSessionKiller()
    const result = await killer.kill(pid)
    expect(result).toBe(true)

    // Poll to confirm the process is gone (up to 3s)
    const isGone = await waitForPidGone(pid, 3000)
    expect(isGone).toBe(true)
  }, 10000)
})

describe('sessionKiller mac stub', () => {
  it('kill throws mac not-implemented error', async () => {
    const stub = new MacSessionKiller()
    await expect(stub.kill(1)).rejects.toThrow('macOS not implemented yet')
  })
})

async function waitForPidGone(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // process.kill with signal 0 tests if pid is alive (throws if gone)
      process.kill(pid, 0)
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch {
      return true
    }
  }
  return false
}
