import { watch } from 'chokidar'

/** Disposes the watcher — call to stop watching. */
export type Disposer = () => Promise<void>

/**
 * Watches `paths` with chokidar and calls `onChange` debounced ~150 ms after
 * any add/change/unlink event. Returns a disposer to stop watching.
 *
 * `ignoreInitial: true` suppresses the synthetic "add" events on startup so
 * only real filesystem mutations trigger the callback.
 */
export function watchPaths(paths: string[], onChange: () => void): Disposer {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onChange()
    }, 150)
  }

  const watcher = watch(paths, {
    ignoreInitial: true,
    persistent: false,
    // Windows: ~/.claude can contain locked/permission-protected session files.
    // Without this + the 'error' handler below, an EPERM surfaces as an uncaught
    // EventEmitter 'error' and crashes the main process (the whole app dies).
    ignorePermissionErrors: true,
    // Avoid recursing into huge/volatile trees (e.g. ~/.claude/projects with
    // thousands of session files) which is both expensive and EPERM-prone.
    depth: 3,
  })

  watcher.on('add', debounced)
  watcher.on('change', debounced)
  watcher.on('unlink', debounced)
  // CRITICAL: chokidar emits 'error' (e.g. EPERM) as an EventEmitter event.
  // With no listener, Node re-throws it as an uncaught exception that takes
  // down the main process. Swallow + log instead — a watch failure on one path
  // must never break the app.
  watcher.on('error', (err) => {
    console.warn('[fileWatch] watcher error (ignored):', (err as Error)?.message ?? err)
  })

  return async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    await watcher.close()
  }
}
