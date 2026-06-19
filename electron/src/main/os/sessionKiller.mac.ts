import type { ISessionKiller } from './sessionKiller'

export class MacSessionKiller implements ISessionKiller {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  kill(_pid: number): Promise<boolean> {
    return Promise.reject(new Error('sessionKiller: macOS not implemented yet (Phase 3 Mac)'))
  }
}
