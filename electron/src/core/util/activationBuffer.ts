/**
 * Renderer-ready handshake buffer.
 *
 * Solves the delivery race on cold start: deep links and open-palette signals
 * that arrive before the renderer's useEffect subscriptions are live are held
 * here and flushed the moment the renderer signals readiness.
 *
 * After setReady() the buffer is a thin pass-through — all deliveries go to
 * the sink immediately. setReady() is idempotent.
 *
 * No Electron import — pure TypeScript, fully unit-testable.
 */

export interface ActivationSink {
  sendDeepLink: (url: string) => void
  sendOpenPalette: () => void
}

export interface ActivationBuffer {
  /** Renderer signalled it has subscribed; flush pending deliveries. */
  setReady(): void
  deliverDeepLink(url: string): void
  deliverOpenPalette(): void
}

export function createActivationBuffer(sink: ActivationSink): ActivationBuffer {
  let ready = false
  let pendingDeepLink: string | null = null
  let pendingOpenPalette = false

  return {
    setReady(): void {
      if (ready) return
      ready = true

      if (pendingDeepLink !== null) {
        sink.sendDeepLink(pendingDeepLink)
        pendingDeepLink = null
      }
      if (pendingOpenPalette) {
        sink.sendOpenPalette()
        pendingOpenPalette = false
      }
    },

    deliverDeepLink(url: string): void {
      if (ready) {
        sink.sendDeepLink(url)
      } else {
        pendingDeepLink = url
      }
    },

    deliverOpenPalette(): void {
      if (ready) {
        sink.sendOpenPalette()
      } else {
        pendingOpenPalette = true
      }
    },
  }
}
