/**
 * Binds the pure handler map to ipcMain and wires the electron-dependent
 * dialog:pickFolder implementation.
 * This module imports electron and is NOT unit-tested.
 */
import type { IpcMain, BrowserWindow, dialog as ElectronDialog } from 'electron'
import { IPC } from '../../shared/ipc'
import type { IpcMap } from '../../shared/ipc'
import { createHandlers } from './handlers'
import type { IpcHandlerDeps } from './handlers'

type DialogModule = { dialog: typeof ElectronDialog }

/**
 * Registers all IPC handlers on ipcMain.
 * The dialog:pickFolder handler uses electron's dialog.showOpenDialog.
 *
 * @param ipcMain - Electron's ipcMain module
 * @param win - The main BrowserWindow (used for dialog parent)
 * @param deps - Service dependencies for the pure handler map
 * @param electronDialog - Electron's dialog module (injected for testability boundary)
 */
export function registerIpc(
  ipcMain: IpcMain,
  win: BrowserWindow,
  deps: Omit<IpcHandlerDeps, 'pickFolder'>,
  electronDialog: DialogModule['dialog'],
): void {
  // Wire the dialog:pickFolder implementation using electron dialog
  const pickFolder: IpcHandlerDeps['pickFolder'] = async (req) => {
    const result = await electronDialog.showOpenDialog(win, {
      title: req.title,
      properties: ['openDirectory'],
    })
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
  }

  const handlers = createHandlers({ ...deps, pickFolder })

  // Bind every channel from the IpcMap
  const channels = Object.values(IPC) as Array<keyof IpcMap>
  for (const channel of channels) {
    ipcMain.handle(channel, (_event, req) => {
      return (handlers[channel] as (req: unknown) => Promise<unknown>)(req)
    })
  }
}
