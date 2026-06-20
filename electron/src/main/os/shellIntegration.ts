/**
 * Electron-dependent glue for OS shell integration: system tray, global hotkey,
 * ccmc:// protocol registration, Windows jump list, and close-to-tray behaviour.
 * Every registration is fail-soft: a refusal logs and continues — nothing here
 * may crash startup or throw out of installShellIntegration.
 * This module imports electron and is NOT unit-tested — same convention as ipc/register.ts.
 */
import { existsSync } from 'node:fs'
import type { App, BrowserWindow, Tray as ElectronTray, Menu as ElectronMenu, Event as ElectronEvent } from 'electron'
import { SCHEME } from '../../core/links/deepLinkParser'
import { deepLinkBuilder } from '../../core/links/deepLinkBuilder'
import { composeShellMenu } from '../../core/launch/shellMenuComposer'
import { buildTrayMenuModel } from '../../core/launch/trayMenuModel'
import { buildJumpListCategories } from '../../core/launch/jumpListModel'
import { loadState, loadStateSync } from '../services/stateStore'

export interface ShellIntegration {
  refresh(): void
  dispose(): void
}

export function installShellIntegration(deps: {
  app: App
  win: BrowserWindow
  statePath: string
  iconPath: string | null
  deliverDeepLink: (url: string) => void
  deliverOpenPalette: () => void
}): ShellIntegration {
  const { app, win, statePath, iconPath, deliverDeepLink, deliverOpenPalette } = deps

  // Dynamically import Electron modules to keep the boundary testable at the
  // module level; these are always available at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Tray, Menu, globalShortcut } = require('electron') as {
    Tray: new (icon: string) => ElectronTray
    Menu: typeof ElectronMenu
    globalShortcut: { register(accel: string, cb: () => void): boolean; unregisterAll(): void }
  }

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  let tray: ElectronTray | null = null
  let reallyExiting = false
  let cachedCloseToTray = loadStateSync(statePath).closeToTray

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function showAndFocus(): void {
    if (win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function buildContextMenu(pinnedPaths: readonly string[], recentPaths: readonly string[]): ElectronMenu {
    const entries = composeShellMenu({ pinnedPaths, recentPaths, recentCap: 5 })
    const model = buildTrayMenuModel(entries)

    const template = model.map((item) => {
      switch (item.kind) {
        case 'project':
          return {
            label: item.label,
            click: () => {
              deliverDeepLink(deepLinkBuilder.build(item.path))
            },
          }
        case 'separator':
          return { type: 'separator' as const }
        case 'empty':
          return { label: item.label, enabled: false }
        case 'open':
          return {
            label: item.label,
            click: () => showAndFocus(),
          }
        case 'exit':
          return {
            label: item.label,
            click: () => {
              reallyExiting = true
              app.quit()
            },
          }
      }
    })

    return Menu.buildFromTemplate(template)
  }

  function refreshJumpList(pinnedPaths: readonly string[], recentPaths: readonly string[]): void {
    try {
      const entries = composeShellMenu({ pinnedPaths, recentPaths, recentCap: 8 })
      const categories = buildJumpListCategories(entries, app.getPath('exe'))
      app.setJumpList(categories as Parameters<App['setJumpList']>[0])
      console.log('[shell] jump list set')
    } catch (err) {
      console.error('[shell] jump list failed:', (err as Error)?.message ?? err)
    }
  }

  // -------------------------------------------------------------------------
  // Protocol registration (#14)
  // -------------------------------------------------------------------------

  try {
    const ok = app.setAsDefaultProtocolClient(SCHEME)
    console.log(`[shell] protocol ccmc:// registered: ${ok}`)
  } catch (err) {
    console.error('[shell] protocol registration failed:', (err as Error)?.message ?? err)
  }

  // -------------------------------------------------------------------------
  // Tray (#12)
  // -------------------------------------------------------------------------

  if (iconPath !== null && existsSync(iconPath)) {
    try {
      tray = new Tray(iconPath)
      tray.setToolTip('Claude Code Management Console')

      // Left-click toggles window visibility
      tray.on('click', () => {
        if (win.isDestroyed()) return
        if (win.isVisible() && !win.isMinimized()) {
          win.hide()
        } else {
          showAndFocus()
        }
      })

      // Set an initial empty menu until first refresh() provides state
      tray.setContextMenu(buildContextMenu([], []))
      console.log('[shell] tray added')
    } catch (err) {
      tray = null
      console.error('[shell] tray creation failed (skipped):', (err as Error)?.message ?? err)
    }
  } else {
    console.warn('[shell] tray skipped — icon not found at:', iconPath)
  }

  // -------------------------------------------------------------------------
  // Global hotkey (#13)
  // -------------------------------------------------------------------------

  try {
    const registered = globalShortcut.register('Control+Alt+Space', () => {
      showAndFocus()
      deliverOpenPalette()
    })
    if (registered) {
      console.log('[shell] global hotkey Control+Alt+Space registered')
    } else {
      console.warn('[shell] global hotkey Control+Alt+Space unavailable (combo owned by another app)')
    }
  } catch (err) {
    console.error('[shell] global hotkey registration failed:', (err as Error)?.message ?? err)
  }

  // -------------------------------------------------------------------------
  // Close-to-tray (#16)
  // -------------------------------------------------------------------------

  const closeHandler = (event: ElectronEvent): void => {
    if (!reallyExiting && cachedCloseToTray) {
      event.preventDefault()
      win.hide()
    }
  }
  win.on('close', closeHandler)

  // -------------------------------------------------------------------------
  // refresh() — re-reads state and rebuilds tray menu + jump list
  // -------------------------------------------------------------------------

  async function refreshAsync(): Promise<void> {
    try {
      const state = await loadState(statePath)
      cachedCloseToTray = state.closeToTray

      if (tray !== null && !win.isDestroyed()) {
        try {
          const menu = buildContextMenu(state.pinned, state.recentLaunches)
          tray.setContextMenu(menu)
        } catch (err) {
          console.error('[shell] tray menu rebuild failed:', (err as Error)?.message ?? err)
        }
      }

      refreshJumpList(state.pinned, state.recentLaunches)
    } catch (err) {
      console.error('[shell] refresh failed:', (err as Error)?.message ?? err)
    }
  }

  // -------------------------------------------------------------------------
  // Initial refresh (fire-and-forget; seeds closeToTray + builds menus once
  // the event loop is running so Electron internals are ready)
  // -------------------------------------------------------------------------

  void refreshAsync()

  // -------------------------------------------------------------------------
  // Public interface
  // -------------------------------------------------------------------------

  return {
    refresh(): void {
      void refreshAsync()
    },
    dispose(): void {
      try {
        win.removeListener('close', closeHandler)
      } catch (err) {
        console.error('[shell] removeListener(close) failed:', (err as Error)?.message ?? err)
      }
      try {
        globalShortcut.unregisterAll()
      } catch (err) {
        console.error('[shell] globalShortcut.unregisterAll failed:', (err as Error)?.message ?? err)
      }
      if (tray !== null) {
        try {
          tray.destroy()
        } catch (err) {
          console.error('[shell] tray.destroy failed:', (err as Error)?.message ?? err)
        }
        tray = null
      }
    },
  }
}
