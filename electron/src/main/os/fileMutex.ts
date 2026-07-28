/**
 * Per-path serialization for read-modify-write sequences.
 *
 * The main process is single-threaded but its IPC handlers are async, so two
 * handlers can interleave: A loads config.json, B loads it, A saves, B saves —
 * and A's change is gone. That is exactly how a launch's lastUsed stamp used to
 * be lost when it raced a config write from the renderer.
 *
 * Callers wrap the whole load→modify→save sequence in withFileLock(path, ...)
 * so it runs to completion before the next one starts. Locks are keyed by
 * normalized path, so different files never block each other.
 */

/** Tail of the pending queue per normalized path. */
const chains = new Map<string, Promise<unknown>>()

function key(filePath: string): string {
  return filePath.replace(/[/\\]+$/, '').toLowerCase()
}

/**
 * Runs `fn` once every previously queued operation for `filePath` has settled.
 * The lock is released whether `fn` resolves or rejects, and the caller sees
 * `fn`'s own result or error unchanged.
 */
export function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const k = key(filePath)
  const previous = chains.get(k) ?? Promise.resolve()

  // Swallow the predecessor's rejection here so one failed write does not
  // poison every later write to the same file.
  const result = previous.then(fn, fn)

  // The queue tail must never be a rejected promise, or the next waiter would
  // see an unhandled rejection.
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  chains.set(k, tail)

  // Drop the entry once the queue drains, so the map does not grow unbounded.
  void tail.then(() => {
    if (chains.get(k) === tail) chains.delete(k)
  })

  return result
}

/** Test helper: number of paths with a pending queue. */
export function pendingLockCount(): number {
  return chains.size
}
