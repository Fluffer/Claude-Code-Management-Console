/**
 * Extracts a ccmc:// deep-link argument from a process argv array.
 * Mirrors App.xaml.cs which scans argv for the first element starting with the scheme.
 * Pure — no Node.js or Electron imports.
 */

import { SCHEME } from './deepLinkParser'

const PREFIX = `${SCHEME}://`

/**
 * Returns the first element of argv that starts with `ccmc://` (case-insensitive on the
 * scheme), trimmed. Empty or whitespace-only args are ignored. Returns null if none found.
 */
export function extractDeepLinkArg(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (!arg || !arg.trim()) continue
    if (arg.trim().toLowerCase().startsWith(PREFIX)) {
      return arg.trim()
    }
  }
  return null
}
