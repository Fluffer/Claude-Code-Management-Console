import type { ITerminalLauncher, LaunchResult } from './terminalLauncher'
import type { LaunchSpec } from '../../core/models'

export class MacTerminalLauncher implements ITerminalLauncher {
  launch(_spec: LaunchSpec): Promise<LaunchResult> {
    return Promise.reject(new Error('terminalLauncher: macOS not implemented yet (Phase 3 Mac)'))
  }
}
