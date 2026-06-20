/**
 * Window augmentation for the typed ccmc API exposed by the preload script.
 * Import this in renderer entry points or tsconfig lib to get window.ccmc typing.
 */
import type { CcmcApi } from './preload'

declare global {
  interface Window {
    ccmc: CcmcApi
  }
}

export {}
