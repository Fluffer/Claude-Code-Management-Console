import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ICommandLocator } from './commandLocator'

/**
 * Windows command locator. Port of CommandLocator.cs.
 * Searches PATH directories with PATHEXT extensions.
 * No shell:true, no child_process — pure fs stat checks.
 */
/**
 * Existence check that works for Windows Store app-execution aliases
 * (e.g. %LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe, pwsh.exe). Those are
 * AppExecLink reparse points: fs.stat() on them fails with EACCES even though
 * they exist and are launchable, so we must NOT use stat().isFile(). fs.access
 * (F_OK) succeeds on them, so it is the correct existence test here.
 */
async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

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
        const candidate = path.join(dir, command + ext)
        if (await pathExists(candidate)) return candidate
      }
    }
    return null
  }

  async findWindowsTerminal(): Promise<string | null> {
    return this.findTerminalPath('wt.exe')
  }

  async findTerminalPath(exeName: string): Promise<string | null> {
    const onPath = await this.findOnPath(exeName)
    if (onPath !== null) return onPath

    const localAppData = process.env['LOCALAPPDATA'] ?? ''
    if (!localAppData) return null

    const alias = path.join(localAppData, 'Microsoft', 'WindowsApps', exeName)
    return (await pathExists(alias)) ? alias : null
  }

  async getPreferredShell(): Promise<string> {
    const pwsh = await this.findOnPath('pwsh.exe')
    return pwsh !== null ? 'pwsh' : 'powershell'
  }
}
