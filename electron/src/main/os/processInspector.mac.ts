import type { IProcessInspector } from './processInspector'
import type { ProcEntry } from '../../core/os/processOutputParser'
import type { RunningSession } from '../../core/models'

export class MacProcessInspector implements IProcessInspector {
  findAllProcesses(): Promise<ProcEntry[]> {
    return Promise.reject(new Error('processInspector: macOS not implemented yet (Phase 3 Mac)'))
  }

  findClaudeSessions(): Promise<RunningSession[]> {
    return Promise.reject(new Error('processInspector: macOS not implemented yet (Phase 3 Mac)'))
  }
}
