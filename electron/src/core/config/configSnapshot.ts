/**
 * Pure logic for config snapshot filename generation and stale-file selection.
 *
 * The C# ConfigSnapshot.Write does: check file exists → create snapshots/ dir →
 * copy file → prune oldest files. That fs orchestration is deferred to Phase 3.
 * // TODO Phase 3: IPC handler that calls fs.copyFile, fs.mkdir, fs.readdir,
 * // fs.unlink using generateSnapshotFilename() for naming and selectFilesToPrune()
 * // for pruning. Fail-soft: snapshot failure must never block the save.
 *
 * Direct port of pure logic from C# ConfigSnapshot.
 */

/**
 * Generates the snapshot filename for a given UTC timestamp.
 * Format: config-YYYYMMDD-HHmmss.json
 * Matches C# format string: $"config-{stampUtc:yyyyMMdd-HHmmss}.json"
 */
export function generateSnapshotFilename(stamp: Date): string {
  const y = stamp.getUTCFullYear()
  const mo = String(stamp.getUTCMonth() + 1).padStart(2, '0')
  const d = String(stamp.getUTCDate()).padStart(2, '0')
  const h = String(stamp.getUTCHours()).padStart(2, '0')
  const mi = String(stamp.getUTCMinutes()).padStart(2, '0')
  const s = String(stamp.getUTCSeconds()).padStart(2, '0')
  return `config-${y}${mo}${d}-${h}${mi}${s}.json`
}

/**
 * Given a list of snapshot filenames and a keep count, returns the filenames
 * that should be deleted (the oldest ones beyond the keep limit).
 *
 * Sorts descending by filename (timestamps sort chronologically as ordinal
 * strings), then returns everything after the first `keep` entries.
 *
 * Matches C# Prune: OrderByDescending(f => f, StringComparer.Ordinal).Skip(keep)
 */
export function selectFilesToPrune(filenames: string[], keep: number): string[] {
  const sorted = [...filenames].sort((a, b) => b.localeCompare(a))
  return sorted.slice(keep)
}
