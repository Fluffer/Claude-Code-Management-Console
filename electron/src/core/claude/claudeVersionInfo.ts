/** Parses and compares claude CLI semver strings. Unknown input never nags. */

export interface SemVer {
  major: number
  minor: number
  patch: number
}

const SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/

/** Extracts the first semver triple from raw, or null if not found / blank. */
export function parse(raw: string | null | undefined): SemVer | null {
  if (!raw || !raw.trim()) return null
  const m = SEMVER_RE.exec(raw)
  if (!m) return null
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) }
}

/** Returns true when latest is strictly newer than installed; false for any unknown. */
export function isOutdated(installed: string | null | undefined, latest: string | null | undefined): boolean {
  const a = parse(installed)
  const b = parse(latest)
  if (!a || !b) return false
  return compareSemver(b, a) > 0
}

function compareSemver(x: SemVer, y: SemVer): number {
  if (x.major !== y.major) return x.major - y.major
  if (x.minor !== y.minor) return x.minor - y.minor
  return x.patch - y.patch
}
