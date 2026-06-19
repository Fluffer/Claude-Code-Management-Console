import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ICommandLocator } from './commandLocator'

/**
 * Windows command locator. Port of CommandLocator.cs.
 * Searches PATH directories with PATHEXT extensions.
 * No shell:true, no child_process — pure fs stat checks.
 */
export class WindowsCommandLocator implements ICommandLocator {
  async findOnPath(command: string): Promise<string | null> {
    const pathExt = (process.env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .map(e => e.trim())
      .filter(e => e.length > 0)

    const extensions = path.extname(command).length > 0 ? [''] : pathExt

    const paths = (process.env['PATH'] ?? '')
      .split(';')
      .map(p => p.trim())
      .filter(p => p.length > 0)

    for (const dir of paths) {
      for (const ext of extensions) {
        try {
          const candidate = path.join(dir, command + ext)
          const stat = await fs.stat(candidate)
          if (stat.isFile()) return candidate
        } catch {
          // Directory doesn't exist or file not found — try next
        }
      }
    }
    return null
  }

  async findWindowsTerminal(): Promise<string | null> {
    const onPath = await this.findOnPath('wt.exe')
    if (onPath !== null) return onPath

    const localAppData = process.env['LOCALAPPDATA'] ?? ''
    if (!localAppData) return null

    const alias = path.join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe')
    try {
      const stat = await fs.stat(alias)
      return stat.isFile() ? alias : null
    } catch {
      return null
    }
  }

  async getPreferredShell(): Promise<string> {
    const pwsh = await this.findOnPath('pwsh.exe')
    return pwsh !== null ? 'pwsh' : 'powershell'
  }
}
