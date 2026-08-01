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
import { watchPaths, type Disposer } from './os/fileWatch'
import { loadConfig } from './services/configStore'
import { consumeSelfWrite } from './os/selfWriteTracker'
import { registerIpc } from './ipc/register'
import { createApproverService } from './services/approverService'
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

// Resolve the app icon (the same app.ico used by the tray and the packaged
// AppX manifest) so the BrowserWindow — and therefore the taskbar — shows it
// instead of the default Electron atom. Packaged build reads from
// process.resourcesPath; dev reads from the source resources directory.
function resolveAppIcon(): string | null {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'app.ico')
    : join(__dirname, '../../resources/app.ico')
  return existsSync(iconPath) ? iconPath : null
}

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
    const windowIcon = resolveAppIcon()
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      autoHideMenuBar: true,
      ...(windowIcon ? { icon: windowIcon } : {}),
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

    // Terminal auto-approver daemon. Script ships under resources (packaged) or
    // the repo's tools/ dir (dev); it runs from a writable app-data copy.
    const approverSource = app.isPackaged
      ? join(process.resourcesPath, 'tools', 'terminal-auto-approver')
      : join(app.getAppPath(), '..', 'tools', 'terminal-auto-approver')
    const approverWorkDir = join(resolveAppDataDir(appDataBase), 'approver')
    const approver = createApproverService({ sourceDir: approverSource, workDir: approverWorkDir })
    await approver.init()

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
      approver,
      onRendererReady: () => activation.setReady(),
    }, dialog, shell)

    // Same icon the BrowserWindow/taskbar uses, shared with the tray and
    // jump list via shell integration.
    const resolvedIconPath = resolveAppIcon()

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
    watchPaths(watchedPaths, (changed) => {
      // Suppress the echo of our own writes. Pinning a project or stamping
      // lastUsed after a launch writes state/config, which the watcher would
      // otherwise report as an external change — making the renderer rescan
      // every root, re-run git status per project and re-enumerate sessions.
      // The renderer already refreshes itself after the actions it initiates.
      const external = changed.filter((p) => !consumeSelfWrite(p))

      if (external.length > 0) {
        if (mainWindow !== null && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('event:fileChanged', { path: external[0] })
        }
      } else {
        console.log('[watch] own write, renderer refresh skipped:', changed.join(', '))
      }

      // Tray menu and jump list are built from state.json, so they must follow
      // our own writes too — a pin change has to show up there immediately.
      shellIntegration.refresh()

      // The set of roots may have just changed (Settings, drag-drop, clone), so
      // re-point the source-root watcher at whatever is configured now.
      void resyncRootWatcher()
    })

    // ------------------------------------------------------------------------
    // Source-root watcher — picks up project folders created or removed outside
    // the app. Separate from the config/state watcher above because it needs
    // different options: depth 0, since a root's immediate children are the
    // projects and descending into each project's node_modules would be
    // ruinous; and directory events, since a new project IS a new directory and
    // nothing else about it changes.
    //
    // Rebuilt whenever config changes, because roots are user-editable at
    // runtime. Roots are ordinary source folders, so unlike ~/.claude they
    // watch cleanly.
    // ------------------------------------------------------------------------
    let disposeRootWatcher: Disposer | null = null
    let watchedRoots: string[] = []

    async function resyncRootWatcher(): Promise<void> {
      let roots: string[]
      try {
        roots = (await loadConfig(configPath)).roots ?? []
      } catch (err) {
        console.warn('[watch] could not read roots:', (err as Error)?.message ?? err)
        return
      }

      // Cheap identity check — config changes for many reasons (a launch stamps
      // lastUsed), and tearing down chokidar on every one of them is waste.
      const same =
        roots.length === watchedRoots.length && roots.every((r, i) => r === watchedRoots[i])
      if (same && disposeRootWatcher !== null) return

      if (disposeRootWatcher !== null) {
        await disposeRootWatcher()
        disposeRootWatcher = null
      }
      watchedRoots = roots
      if (roots.length === 0) return

      console.log('[watch] source roots:', roots.join(', '))
      disposeRootWatcher = watchPaths(
        roots,
        (changed) => {
          console.log('[watch] project folder changed:', changed.join(', '))
          if (mainWindow !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('event:fileChanged', { path: changed[0] })
          }
        },
        { depth: 0, watchDirectories: true },
      )
    }

    void resyncRootWatcher()

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
      approver.dispose()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
