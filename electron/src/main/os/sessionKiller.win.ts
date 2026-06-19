import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ISessionKiller } from './sessionKiller'

const execFileAsync = promisify(execFile)

/**
 * Windows session killer using `taskkill /PID <pid> /T /F`.
 * /T kills the entire process tree; /F forces termination.
 * Uses execFile with array args — no shell:true, no string concatenation.
 * Ported from SessionKiller.cs.
 */
export class WindowsSessionKiller implements ISessionKiller {
  async kill(pid: number): Promise<boolean> {
    try {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 10000,
      })
      return true
    } catch (err) {
      const e = err as { code?: string; stderr?: string; message?: string }
      // taskkill exits with code 128 or prints "not found" when the process
      // is already gone — treat that as success (it's already dead).
      const msg = (e.stderr ?? e.message ?? '').toLowerCase()
      if (msg.includes('not found') || msg.includes('no running instance') || msg.includes('pid не')) {
        return true
      }
      // Unknown failure — return false rather than throwing
      return false
    }
  }
}
