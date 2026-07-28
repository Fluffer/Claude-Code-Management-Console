/**
 * Binds the pure handler map to ipcMain and wires the electron-dependent
 * dialog:pickFolder, shell:openPath, and shell:openInVscode implementations.
 * This module imports electron and is NOT unit-tested.
 */
import { spawn } from 'node:child_process'
import type { IpcMain, BrowserWindow, dialog as ElectronDialog, shell as ElectronShell } from 'electron'
import { buildInvocation } from '../../core/launch/batchInvocation'
import { IPC } from '../../shared/ipc'
import type { IpcMap } from '../../shared/ipc'
import { createHandlers } from './handlers'
import type { IpcHandlerDeps } from './handlers'

type DialogModule = { dialog: typeof ElectronDialog }
type ShellModule = { shell: typeof ElectronShell }

/**
 * Registers all IPC handlers on ipcMain.
 * The dialog:pickFolder handler uses electron's dialog.showOpenDialog.
 * shell:openPath uses electron shell.openPath.
 * shell:openInVscode spawns `code <path>` (resolved via commandLocator).
 *
 * @param ipcMain - Electron's ipcMain module
 * @param win - The main BrowserWindow (used for dialog parent)
 * @param deps - Service dependencies for the pure handler map
 * @param electronDialog - Electron's dialog module (injected for testability boundary)
 * @param electronShell - Electron's shell module (injected for testability boundary)
 */
export function registerIpc(
  ipcMain: IpcMain,
  win: BrowserWindow,
  deps: Omit<IpcHandlerDeps, 'pickFolder' | 'openPath' | 'openExternal' | 'openInVscode'>,
  electronDialog: DialogModule['dialog'],
  electronShell: ShellModule['shell'],
): void {
  // Wire the dialog:pickFolder implementation using electron dialog
  const pickFolder: IpcHandlerDeps['pickFolder'] = async (req) => {
    const result = await electronDialog.showOpenDialog(win, {
      title: req.title,
      properties: ['openDirectory'],
    })
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
  }

  // Wire shell:openPath — electron shell.openPath returns '' on success or error string
  const openPath: IpcHandlerDeps['openPath'] = (filePath) => {
    return electronShell.openPath(filePath)
  }

  // Wire the URL branch of shell:openPath (the PR link from git:openPr).
  // shell.openPath cannot open a URL — openExternal is the correct API.
  const openExternal: IpcHandlerDeps['openExternal'] = (url) => {
    return electronShell.openExternal(url)
  }

  // Wire shell:openInVscode — resolve `code` and spawn it.
  // On Windows `code` is a .cmd shim, which Node refuses to spawn directly
  // (EINVAL), so buildInvocation routes it through cmd.exe.
  const openInVscode: IpcHandlerDeps['openInVscode'] = async (filePath) => {
    const codePath = await deps.commandLocator.findOnPath('code')
    if (codePath === null) {
      return { ok: false, error: 'VS Code CLI (code) not found on PATH. Install VS Code and ensure the "code" command is available.' }
    }
    return new Promise((resolve) => {
      try {
        const inv = buildInvocation(codePath, [filePath], { comSpec: process.env['ComSpec'] })
        const child = spawn(inv.file, inv.args, {
          shell: false,
          detached: true,
          stdio: 'ignore',
          windowsVerbatimArguments: inv.windowsVerbatimArguments,
        })
        // Resolve only once the OS has actually started the process — resolving
        // eagerly would report success before an 'error' event could arrive.
        child.on('error', (err) => resolve({ ok: false, error: err.message }))
        child.on('spawn', () => {
          child.unref()
          resolve({ ok: true })
        })
      } catch (err) {
        // buildInvocation rejects '%' paths; spawn can also throw synchronously.
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  const handlers = createHandlers({ ...deps, pickFolder, openPath, openExternal, openInVscode })

  // Bind every channel from the IpcMap
  const channels = Object.values(IPC) as Array<keyof IpcMap>
  for (const channel of channels) {
    ipcMain.handle(channel, (_event, req) => {
      return (handlers[channel] as (req: unknown) => Promise<unknown>)(req)
    })
  }
}
