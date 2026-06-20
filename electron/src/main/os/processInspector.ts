import type { ProcEntry } from '../../core/os/processOutputParser'
import type { RunningSession } from '../../core/models'
import { WindowsProcessInspector } from './processInspector.win'
import { MacProcessInspector } from './processInspector.mac'

/** Interface for OS process inspection. */
export interface IProcessInspector {
  /** Returns all running processes as ProcEntry[]. */
  findAllProcesses(): Promise<ProcEntry[]>
  /** Returns processes that look like running Claude CLI sessions. */
  findClaudeSessions(): Promise<RunningSession[]>
}

export function createProcessInspector(): IProcessInspector {
  if (process.platform === 'win32') {
    return new WindowsProcessInspector()
  }
  return new MacProcessInspector()
}
