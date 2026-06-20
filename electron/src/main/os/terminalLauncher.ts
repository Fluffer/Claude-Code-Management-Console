import type { LaunchSpec } from '../../core/models'
import { WindowsTerminalLauncher } from './terminalLauncher.win'
import { MacTerminalLauncher } from './terminalLauncher.mac'

/** Result of a terminal launch attempt. */
export interface LaunchResult {
  ok: boolean
  pid?: number
  error?: string
}

/** Interface for launching a terminal session from a LaunchSpec. */
export interface ITerminalLauncher {
  launch(spec: LaunchSpec): Promise<LaunchResult>
}

export function createTerminalLauncher(): ITerminalLauncher {
  if (process.platform === 'win32') {
    return new WindowsTerminalLauncher()
  }
  return new MacTerminalLauncher()
}
