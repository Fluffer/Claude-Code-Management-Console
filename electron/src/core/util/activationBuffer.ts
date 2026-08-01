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
  sendDeepLink: (url: string, trusted: boolean) => void
  sendOpenPalette: () => void
}

export interface ActivationBuffer {
  /** Renderer signalled it has subscribed; flush pending deliveries. */
  setReady(): void
  /**
   * `trusted` marks a link the app raised itself — the tray menu and jump list
   * build ccmc:// URLs internally to reuse this delivery path. Those are already
   * a deliberate click and must not be second-guessed. Everything arriving from
   * outside (argv on cold start, second-instance) defaults to untrusted and is
   * confirmed before it can start a session.
   */
  deliverDeepLink(url: string, trusted?: boolean): void
  deliverOpenPalette(): void
}

export function createActivationBuffer(sink: ActivationSink): ActivationBuffer {
  let ready = false
  let pendingDeepLink: { url: string; trusted: boolean } | null = null
  let pendingOpenPalette = false

  return {
    setReady(): void {
      if (ready) return
      ready = true

      if (pendingDeepLink !== null) {
        sink.sendDeepLink(pendingDeepLink.url, pendingDeepLink.trusted)
        pendingDeepLink = null
      }
      if (pendingOpenPalette) {
        sink.sendOpenPalette()
        pendingOpenPalette = false
      }
    },

    deliverDeepLink(url: string, trusted = false): void {
      if (ready) {
        sink.sendDeepLink(url, trusted)
      } else {
        pendingDeepLink = { url, trusted }
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
