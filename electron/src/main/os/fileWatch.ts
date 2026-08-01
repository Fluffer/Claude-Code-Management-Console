import { watch } from 'chokidar'

/** Disposes the watcher — call to stop watching. */
export type Disposer = () => Promise<void>

/**
 * Watches `paths` with chokidar and calls `onChange` debounced ~150 ms after
 * any add/change/unlink event. Returns a disposer to stop watching.
 *
 * `onChange` receives the paths that changed during the debounce window, so
 * callers can tell which file moved — and, with selfWriteTracker, whether the
 * change was one of their own writes echoing back.
 *
 * `ignoreInitial: true` suppresses the synthetic "add" events on startup so
 * only real filesystem mutations trigger the callback.
 */
export interface WatchOptions {
  /**
   * chokidar traversal depth. Defaults to 3, which suits watching individual
   * files. Pass 0 when watching a directory whose immediate children are the
   * only thing of interest — source roots hold project folders that each
   * contain node_modules, and recursing into those is ruinous.
   */
  depth?: number
  /**
   * Also report directory add/remove. Off by default: the config/state watcher
   * only cares about files, and reporting dirs there would fire on the atomic
   * write staging folder. Source-root watching needs it — a new project IS a
   * new directory, and nothing else about it changes.
   */
  watchDirectories?: boolean
}

export function watchPaths(
  paths: string[],
  onChange: (changed: string[]) => void,
  options: WatchOptions = {},
): Disposer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = new Set<string>()

  const debounced = (changedPath: string): void => {
    pending.add(changedPath)
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const changed = [...pending]
      pending = new Set()
      onChange(changed)
    }, 150)
  }

  const watcher = watch(paths, {
    ignoreInitial: true,
    persistent: false,
    // writeFileAtomic stages through '<file>.<pid>.<n>.tmp' in the same folder.
    // Those are implementation detail, never a change worth reporting — they
    // only surface when a caller watches a directory rather than a file.
    ignored: /\.\d+\.\d+\.tmp$/,
    // Windows: ~/.claude can contain locked/permission-protected session files.
    // Without this + the 'error' handler below, an EPERM surfaces as an uncaught
    // EventEmitter 'error' and crashes the main process (the whole app dies).
    ignorePermissionErrors: true,
    // Avoid recursing into huge/volatile trees (e.g. ~/.claude/projects with
    // thousands of session files) which is both expensive and EPERM-prone.
    depth: options.depth ?? 3,
  })

  watcher.on('add', debounced)
  watcher.on('change', debounced)
  watcher.on('unlink', debounced)
  if (options.watchDirectories === true) {
    watcher.on('addDir', debounced)
    watcher.on('unlinkDir', debounced)
  }
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
