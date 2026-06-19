import { WindowsSessionKiller } from './sessionKiller.win'
import { MacSessionKiller } from './sessionKiller.mac'

/** Interface for killing a process tree by pid. */
export interface ISessionKiller {
  /** Kill pid and its child tree. Returns true if killed or already gone. */
  kill(pid: number): Promise<boolean>
}

export function createSessionKiller(): ISessionKiller {
  if (process.platform === 'win32') {
    return new WindowsSessionKiller()
  }
  return new MacSessionKiller()
}
