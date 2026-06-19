/** Pure rule: a project's sessions are "stale" if the newest is old AND nothing is running. */

/**
 * Returns true when the project has sessions, none is running, and the newest
 * is older than thresholdDays relative to now.
 *
 * @param newestUtc ISO-8601 UTC string of most-recent session, or null if none.
 * @param nowUtc    ISO-8601 UTC string representing "now" (injected for determinism).
 * @param isRunning Whether a session for this project is currently running.
 * @param thresholdDays Minimum age in days to be considered stale.
 */
export function isStale(
  newestUtc: string | null,
  nowUtc: string,
  isRunning: boolean,
  thresholdDays: number,
): boolean {
  if (newestUtc === null || isRunning) return false
  const ageMs = new Date(nowUtc).getTime() - new Date(newestUtc).getTime()
  return ageMs > thresholdDays * 24 * 60 * 60 * 1000
}
