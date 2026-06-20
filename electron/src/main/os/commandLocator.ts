import { WindowsCommandLocator } from './commandLocator.win'
import { MacCommandLocator } from './commandLocator.mac'

/** Interface for locating executables on the host OS. */
export interface ICommandLocator {
  /** Find an executable on PATH (respects PATHEXT on Windows). Returns null if not found. */
  findOnPath(command: string): Promise<string | null>
  /** Find wt.exe (Windows Terminal). Returns null if not installed. */
  findWindowsTerminal(): Promise<string | null>
  /**
   * Resolve a terminal executable by name (e.g. 'wt.exe', 'wtai.exe') on
   * Windows: PATH first, then the WindowsApps app-execution alias. Returns null
   * if not found. macOS: null until Phase 3.
   */
  findTerminalPath(exeName: string): Promise<string | null>
  /** Returns 'pwsh' if PowerShell 7 is available, else 'powershell'. */
  getPreferredShell(): Promise<string>
}

export function createCommandLocator(): ICommandLocator {
  if (process.platform === 'win32') {
    return new WindowsCommandLocator()
  }
  return new MacCommandLocator()
}
