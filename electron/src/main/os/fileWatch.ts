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
  })

  watcher.on('add', debounced)
  watcher.on('change', debounced)
  watcher.on('unlink', debounced)

  return async (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    await watcher.close()
  }
}
