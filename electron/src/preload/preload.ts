import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose a typed API to the renderer via contextBridge.
// contextIsolation: true and sandbox: true are enforced in main.ts.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (fallback for development without contextIsolation — should not occur)
  window.electron = electronAPI
}
