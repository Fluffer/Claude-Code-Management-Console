/**
 * Re-keys stored project paths after a folder is renamed or moved.
 *
 * A project's saved flags and lastUsed live in `config.projects` keyed by the
 * project's absolute path, and its pin / recent-launch entries live in
 * `state.json` as bare path strings. Renaming or moving the folder changes that
 * path, so without this the settings silently detach from the project: flags
 * reset, the pin disappears, and the Recent entry dangles.
 *
 * Matching is case-insensitive with trailing separators ignored, matching how
 * the rest of the app compares Windows paths.
 */

/** Lower-cases and strips trailing path separators. */
function normalize(p: string): string {
  return p.replace(/[/\\]+$/, '').toLowerCase()
}

/** Strips trailing path separators, preserving case (used for stored values). */
function trimTrailingSeparators(p: string): string {
  return p.replace(/[/\\]+$/, '')
}

/**
 * Returns a copy of `map` with the entry keyed by `oldPath` re-keyed to
 * `newPath`, preserving insertion order. Any pre-existing entry at `newPath`
 * is replaced by the moved one. Absent old key → an equal copy.
 */
export function remapPathKeys<T>(
  map: Record<string, T> | null | undefined,
  oldPath: string,
  newPath: string,
): Record<string, T> {
  const result: Record<string, T> = {}
  if (!map) return result

  const oldKey = normalize(oldPath)
  const newKey = trimTrailingSeparators(newPath)
  const newKeyNormalized = normalize(newPath)
  const moved = Object.entries(map).find(([k]) => normalize(k) === oldKey)

  for (const [key, value] of Object.entries(map)) {
    if (normalize(key) === oldKey) {
      result[newKey] = value
    } else if (moved && normalize(key) === newKeyNormalized) {
      // A stale entry already sits at the destination — the moved one wins.
      continue
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Returns a copy of `list` with `oldPath` replaced by `newPath` in place.
 * If `newPath` is already in the list the old entry is dropped rather than
 * duplicated. Absent old path → an equal copy.
 */
export function remapPathList(
  list: readonly string[] | null | undefined,
  oldPath: string,
  newPath: string,
): string[] {
  if (!list) return []

  const oldKey = normalize(oldPath)
  const newKey = trimTrailingSeparators(newPath)
  const newKeyNormalized = normalize(newPath)
  const alreadyPresent = list.some((p) => normalize(p) === newKeyNormalized)

  const result: string[] = []
  for (const entry of list) {
    if (normalize(entry) === oldKey) {
      if (!alreadyPresent) result.push(newKey)
    } else {
      result.push(entry)
    }
  }
  return result
}
