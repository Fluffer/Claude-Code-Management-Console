import type { ICommandLocator } from './commandLocator'

export class MacCommandLocator implements ICommandLocator {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findOnPath(_command: string): Promise<string | null> {
    return Promise.reject(new Error('commandLocator: macOS not implemented yet (Phase 3 Mac)'))
  }

  findWindowsTerminal(): Promise<string | null> {
    return Promise.reject(new Error('commandLocator: macOS not implemented yet (Phase 3 Mac)'))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findTerminalPath(_exeName: string): Promise<string | null> {
    // macOS terminal detection lands in Phase 3 Mac; null = none detected.
    return Promise.resolve(null)
  }

  getPreferredShell(): Promise<string> {
    return Promise.reject(new Error('commandLocator: macOS not implemented yet (Phase 3 Mac)'))
  }
}
