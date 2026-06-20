/**
 * Reads and edits .env file content as KEY=VALUE lines, preserving comments,
 * blank lines, and order. Pure string operations — file I/O is the caller's
 * responsibility. Values are returned verbatim (no unquoting) to avoid
 * corrupting secrets on round-trip.
 *
 * Direct port of C# EnvFileEditor.
 */

/** One parsed KEY=VALUE pair from a .env file. */
export interface EnvEntry {
  key: string
  value: string
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/** Split on '\n' preserving the trailing empty element (keeps final newline on round-trip). */
function splitKeepingTrailing(text: string): string[] {
  return text.split('\n')
}

function isAssignmentFor(line: string, key: string): boolean {
  const t = line.trimStart()
  const eq = t.indexOf('=')
  if (eq <= 0) return false
  return t.slice(0, eq).trim() === key  // ordinal / case-sensitive, same as C#
}

/**
 * Parses KEY=VALUE lines from .env text. Skips comments (#) and blank lines.
 * Values are returned verbatim (no unquoting).
 */
export function parse(text: string): EnvEntry[] {
  const result: EnvEntry[] = []
  for (const raw of normalize(text).split('\n')) {
    const line = raw.trimStart()
    if (line.length === 0 || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    result.push({ key: line.slice(0, eq).trim(), value: line.slice(eq + 1) })
  }
  return result
}

/**
 * Replaces the value of an existing key in-place, or appends a new KEY=VALUE
 * line. Preserves comments, blank lines, and ordering. Preserves trailing newline.
 */
export function setKey(text: string, key: string, value: string): string {
  const lines = splitKeepingTrailing(normalize(text))
  for (let i = 0; i < lines.length; i++) {
    if (isAssignmentFor(lines[i], key)) {
      lines[i] = `${key}=${value}`
      return lines.join('\n')
    }
  }
  // Insert before any trailing empty element so we keep a single final newline.
  const insertAt =
    lines.length > 0 && lines[lines.length - 1].length === 0
      ? lines.length - 1
      : lines.length
  lines.splice(insertAt, 0, `${key}=${value}`)
  return lines.join('\n')
}

/**
 * Removes all lines matching the given key. Preserves everything else.
 */
export function removeKey(text: string, key: string): string {
  const lines = splitKeepingTrailing(normalize(text))
  return lines.filter(l => !isAssignmentFor(l, key)).join('\n')
}
