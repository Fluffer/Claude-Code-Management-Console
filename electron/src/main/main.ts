import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'node:fs'
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
import { extractDeepLinkArg } from '../core/links/deepLinkArg'
import { installShellIntegration } from './os/shellIntegration'
import { createActivationBuffer } from '../core/util/activationBuffer'

let mainWindow: BrowserWindow | null = null

// Renderer-ready handshake buffer — created at module scope so the sink closure
// captures the module-level mainWindow variable and follows reassignment.
const activation = createActivationBuffer({
  sendDeepLink: (url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:deepLink', { url })
    }
  },
  sendOpenPalette: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:openPalette')
    }
  },
})

// Safety net: a stray async error (e.g. a filesystem watcher EPERM) must not
// take down the whole main process and silently break all IPC. Log loudly
// instead of letting Electron show the fatal "uncaught exception" dialog.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

// ---------------------------------------------------------------------------
// Single-instance lock (#14) — must be requested before app.whenReady()
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.log('[shell] single-instance lock not acquired — another instance is running, quitting')
  app.quit()
} else {
  console.log('[shell] single-instance lock acquired')

  // When a second instance is launched, bring the existing window to the front
  // and relay any deep-link URL it carries.
  app.on('second-instance', (_event, argv) => {
    const url = extractDeepLinkArg(argv)
    if (url) {
      activation.deliverDeepLink(url)
    }
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

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

      // First-launch deep link: buffer for delivery once the renderer signals readiness.
      const url = extractDeepLinkArg(process.argv)
      if (url) {
        activation.deliverDeepLink(url)
      }
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      try {
        const parsed = new URL(details.url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
          void shell.openExternal(details.url)
        }
      } catch {
        // Unparseable URL — deny silently
      }
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
      onRendererReady: () => activation.setReady(),
    }, dialog, shell)

    // Resolve icon path: packaged build uses process.resourcesPath, dev uses
    // the source resources directory.
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'app.ico')
      : join(__dirname, '../../resources/app.ico')
    const resolvedIconPath = existsSync(iconPath) ? iconPath : null

    // Install OS shell integration: tray, hotkey, protocol, jump list, close-to-tray.
    let shellIntegration = installShellIntegration({
      app,
      win: mainWindow,
      statePath,
      iconPath: resolvedIconPath,
      deliverDeepLink: (url) => activation.deliverDeepLink(url),
      deliverOpenPalette: () => activation.deliverOpenPalette(),
    })

    // Push file-changed events to renderer when config/state change.
    // NOTE: we deliberately do NOT recursively watch claudeDir (~/.claude) — on
    // Windows it contains locked/permission-protected files that throw EPERM from
    // the native fs watcher (which chokidar surfaces as an uncaught error). Running
    // sessions are already polled on an interval, so we only watch the two specific
    // config/state files, which live in %APPDATA% and watch cleanly.
    void claudeDir
    const watchedPaths = [configPath, statePath]
    watchPaths(watchedPaths, () => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('event:fileChanged', { path: '' })
      }
      shellIntegration.refresh()
    })

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        shellIntegration.dispose()
        createWindow()
        if (mainWindow !== null) {
          shellIntegration = installShellIntegration({
            app,
            win: mainWindow,
            statePath,
            iconPath: resolvedIconPath,
            deliverDeepLink: (url) => activation.deliverDeepLink(url),
            deliverOpenPalette: () => activation.deliverOpenPalette(),
          })
        }
      }
    })

    app.on('will-quit', () => {
      shellIntegration.dispose()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
