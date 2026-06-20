/** Pure diff of running-session snapshots: which projects just ended. */

/**
 * Returns the paths present in previous but absent in current (case-insensitive).
 */
export function ended(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
): string[] {
  const lowerCurrent = new Set([...current].map((s) => s.toLowerCase()))
  return [...previous].filter((p) => !lowerCurrent.has(p.toLowerCase()))
}
