/**
 * Window augmentation for the typed ccmc API exposed by the preload script.
 * The shape lives in the shared IPC contract so preload and renderer cannot
 * drift; preload.ts asserts its exposed object against it.
 */
import type { CcmcBridge } from '../shared/ipc'

declare global {
  interface Window {
    ccmc: CcmcBridge
  }
}

export {}
