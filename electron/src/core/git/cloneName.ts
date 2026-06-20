/**
 * Pure helpers for deriving and validating a clone target folder name from a
 * git URL.
 *
 * No fs/process access — usable from BOTH the renderer (live name preview and
 * inline validation) and main (server-side re-validation before spawning git
 * clone), so the result never drifts between the two.
 */

// Characters that are illegal in a Windows folder name (not a path).
const WINDOWS_ILLEGAL = /[<>:"|?*]/

// Windows reserved device names (case-insensitive).
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * Derive a default target folder name from a clone URL.
 *
 * Rules:
 *  - Strip trailing slashes, then take the last path segment (splitting on
 *    `/` and `:` to handle both HTTPS and scp-style SSH URLs).
 *  - Strip a single trailing `.git` suffix from that segment.
 *  - Return `''` when no non-empty segment is derivable.
 *
 * Examples:
 *  - `https://github.com/me/foo.git`  → `foo`
 *  - `https://github.com/me/foo`      → `foo`
 *  - `git@github.com:me/foo.git`      → `foo`
 *  - `https://github.com/me/foo/`     → `foo`
 */
export function deriveCloneName(url: string): string {
  const trimmed = url.trim().replace(/[/\\]+$/, '')
  if (!trimmed) return ''

  // Split on both `/` and `:` to cover scp-style URLs (git@host:owner/repo).
  const parts = trimmed.split(/[/:]/)
  const last = parts[parts.length - 1]
  if (!last) return ''

  // Strip a single trailing `.git`.
  const derived = last.replace(/\.git$/, '')
  // A hostile URL (e.g. https://x/../) could produce `.` or `..` — return ''
  // so the prefilled name is empty and the user must type a safe name.
  if (derived === '.' || derived === '..') return ''
  return derived
}

/**
 * Validate a proposed clone target folder name (not a full path).
 *
 * Rejects when the name:
 *  - Is empty or whitespace-only.
 *  - Contains a path separator (`/` or `\`).
 *  - Contains any character illegal in a Windows folder name: `< > : " | ? *`.
 *  - Is the current-directory (`.`) or parent-directory (`..`) reference.
 *  - Is a Windows reserved device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
 *  - Ends with a dot or a space (Windows strips these, causing path confusion).
 */
export function validateCloneName(
  name: string,
): { ok: true } | { ok: false; reason: string } {
  if (!name || !name.trim()) {
    return { ok: false, reason: 'Name must not be empty.' }
  }
  if (name.includes('/') || name.includes('\\')) {
    return { ok: false, reason: 'Name must not contain path separators (/ or \\).' }
  }
  if (WINDOWS_ILLEGAL.test(name)) {
    return { ok: false, reason: 'Name contains a character that is illegal in a folder name (< > : " | ? *).' }
  }
  if (name === '.' || name === '..') {
    return { ok: false, reason: 'Name must not be "." or ".." (directory traversal).' }
  }
  if (WINDOWS_RESERVED.test(name)) {
    return { ok: false, reason: 'Name is a reserved Windows device name (e.g. CON, NUL, COM1).' }
  }
  if (/[. ]$/.test(name)) {
    return { ok: false, reason: 'Name must not end with a dot or a space.' }
  }
  return { ok: true }
}
