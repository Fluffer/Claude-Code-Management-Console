import type { ISessionKiller } from './sessionKiller'

export class MacSessionKiller implements ISessionKiller {
  kill(_pid: number): Promise<boolean> {
    return Promise.reject(new Error('sessionKiller: macOS not implemented yet (Phase 3 Mac)'))
  }
}
