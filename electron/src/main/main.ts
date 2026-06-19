import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as os from 'node:os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getConfigPath, getStatePath } from '../core/util/appPaths'
import { tryMigrateLegacy, resolveAppDataDir } from './services/appPathsResolver'
import { createProcessInspector } from './os/processInspector'
import { createSessionKiller } from './os/sessionKiller'
import { createTerminalLauncher } from './os/terminalLauncher'
import { createCommandLocator } from './os/commandLocator'
import { watchPaths } from './os/fileWatch'
import { registerIpc } from './ipc/register'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ccmc')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Resolve paths
  const appDataBase = app.getPath('appData')
  await tryMigrateLegacy(appDataBase)
  resolveAppDataDir(appDataBase) // ensure migration completes
  const configPath = getConfigPath(appDataBase)
  const statePath = getStatePath(appDataBase)
  const claudeDir = join(os.homedir(), '.claude')

  // Instantiate OS services
  const processInspector = createProcessInspector()
  const sessionKiller = createSessionKiller()
  const terminalLauncher = createTerminalLauncher()
  const commandLocator = createCommandLocator()

  createWindow()

  if (mainWindow === null) return

  // Register all IPC handlers
  registerIpc(ipcMain, mainWindow, {
    configPath,
    statePath,
    claudeDir,
    processInspector,
    sessionKiller,
    terminalLauncher,
    commandLocator,
  }, dialog)

  // Push file-changed events to renderer when config/state/claude dir changes
  const watchedPaths = [configPath, statePath, claudeDir]
  watchPaths(watchedPaths, () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:fileChanged', { path: '' })
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
