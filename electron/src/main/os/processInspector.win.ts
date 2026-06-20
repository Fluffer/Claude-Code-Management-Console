import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { IProcessInspector } from './processInspector'
import type { ProcEntry } from '../../core/os/processOutputParser'
import type { RunningSession } from '../../core/models'
import { parseTasklistCsv, parseWmicProcessOutput, filterClaudeSessions } from '../../core/os/processOutputParser'

const execFileAsync = promisify(execFile)

/**
 * Windows process inspector.
 * Primary: PowerShell Get-CimInstance gives pid, ppid, name, commandLine.
 * Fallback: tasklist /fo csv gives pid + name only (no commandLine).
 * No shell:true, no string interpolation — all args as arrays.
 */
export class WindowsProcessInspector implements IProcessInspector {
  async findAllProcesses(): Promise<ProcEntry[]> {
    const primary = await this.runPowerShellCimInstance()
    if (primary.length > 0) return primary

    // Fallback: plain tasklist (no /v, which fails in some environments)
    return this.runTasklist()
  }

  async findClaudeSessions(): Promise<RunningSession[]> {
    const entries = await this.findAllProcesses()
    return filterClaudeSessions(entries)
  }

  private async runPowerShellCimInstance(): Promise<ProcEntry[]> {
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_Process | Select-Object Caption,CommandLine,ParentProcessId,ProcessId | ConvertTo-Csv -NoTypeInformation',
        ],
        {
          windowsHide: true,
          timeout: 15000,
        }
      )
      return parseWmicProcessOutput(stdout)
    } catch {
      return []
    }
  }

  private async runTasklist(): Promise<ProcEntry[]> {
    try {
      // /fo csv only (no /v) — /v fails in some session types
      const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv'], {
        windowsHide: true,
        timeout: 10000,
      })
      return parseTasklistCsv(stdout)
    } catch {
      return []
    }
  }
}
