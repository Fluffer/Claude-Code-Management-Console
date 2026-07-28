/**
 * Renderer ambient declarations: build-time globals and the preload bridge.
 *
 * The bridge type comes from the shared IPC contract rather than from
 * src/preload, so the renderer TS project does not need the preload
 * implementation (and its electron/node imports) on its include path.
 */
import type { CcmcBridge } from '../shared/ipc'

declare global {
  /** The app version, inlined from package.json at build time (see electron.vite.config.ts). */
  const __APP_VERSION__: string

  interface Window {
    ccmc: CcmcBridge
  }
}

export {}
