/**
 * Records files this process just wrote, so the file watcher can tell the
 * app's own writes apart from edits made outside it.
 *
 * Without this, every state.json write the app makes (pinning a project,
 * changing the sort order, stamping lastUsed after a launch) comes straight
 * back through the watcher as a "the file system changed" event, which makes
 * the renderer rescan every root, re-run `git status` for every project, and
 * re-enumerate running sessions. Pinning one project triggered the lot.
 *
 * The window is deliberately short: a genuine external edit that lands within
 * a couple of seconds of one of our own writes is indistinguishable from the
 * echo, and losing that notification is far cheaper than the storm.
 */

const DEFAULT_WINDOW_MS = 2000

/** Normalized path → timestamp of our most recent write. */
const writes = new Map<string, number>()

function key(filePath: string): string {
  return filePath.replace(/[/\\]+$/, '').toLowerCase()
}

/** Records that this process just wrote `filePath`. */
export function markSelfWrite(filePath: string, now: number = Date.now()): void {
  writes.set(key(filePath), now)
}

/**
 * True when `filePath` was written by this process within `windowMs`.
 * Consumes the record, so a single write suppresses a single echo — a second
 * event for the same path (a real external edit) still gets through.
 */
export function consumeSelfWrite(
  filePath: string,
  windowMs: number = DEFAULT_WINDOW_MS,
  now: number = Date.now(),
): boolean {
  const k = key(filePath)
  const at = writes.get(k)
  if (at === undefined) return false

  writes.delete(k)
  return now - at <= windowMs
}

/** Test helper: forget every recorded write. */
export function clearSelfWrites(): void {
  writes.clear()
}
