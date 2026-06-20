/**
 * Preload script.
 * contextIsolation: true and sandbox: true are enforced in main.ts.
 * Exposes a typed `window.ccmc` API to the renderer. Raw ipcRenderer is never exposed.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcMap, IpcEvents } from '../shared/ipc'

const api = {
  /**
   * Typed invoke: call an IPC channel from the renderer.
   * Returns a promise of the channel's response type.
   */
  invoke<C extends keyof IpcMap>(
    channel: C,
    ...args: IpcMap[C]['req'] extends void ? [] : [req: IpcMap[C]['req']]
  ): Promise<IpcMap[C]['res']> {
    const req = args[0] as IpcMap[C]['req']
    return ipcRenderer.invoke(channel, req) as Promise<IpcMap[C]['res']>
  },

  /**
   * Returns the absolute file-system path for a dropped File object.
   * Required under sandbox:true (Electron 32) because File.path is undefined
   * in sandboxed renderers — webUtils.getPathForFile is the only safe API.
   */
  pathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },

  /**
   * Subscribe to a main→renderer push event.
   * Returns an unsubscribe function.
   */
  on<E extends keyof IpcEvents>(
    event: E,
    listener: (payload: IpcEvents[E]) => void,
  ): () => void {
    const handler = (_e: Electron.IpcRendererEvent, payload: IpcEvents[E]): void => {
      listener(payload)
    }
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.off(event, handler)
  },
}

export type CcmcApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('ccmc', api)
  } catch (error) {
    console.error('[preload] contextBridge.exposeInMainWorld failed:', error)
  }
} else {
  // Development fallback — should not occur with sandbox:true
  // @ts-expect-error non-isolated fallback
  window.ccmc = api
}
