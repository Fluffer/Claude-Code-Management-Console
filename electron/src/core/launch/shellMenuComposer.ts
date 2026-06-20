/**
 * Single source of truth for the tray menu and taskbar jump list:
 * pinned projects first (config order), then recents (newest first) minus
 * anything already pinned, capped at recentCap.
 *
 * Direct port of C# ShellMenuComposer. Pure — uses only `path` (allowed).
 */

import path from 'path'

/** One entry in the tray menu / jump list. Label is the folder name. */
export interface ShellMenuEntry {
  label: string
  path: string
  isPinned: boolean
}

export interface ComposeShellMenuOptions {
  pinnedPaths: readonly string[]
  recentPaths: readonly string[]
  recentCap: number
}

function labelOf(p: string): string {
  return path.basename(p.replace(/[\\/]+$/, ''))
}

/**
 * Composes a menu list from pinned + recent paths.
 * - Pinned paths appear first, in config order.
 * - Recent paths follow, newest-first, de-duped against pinned (case-insensitive).
 * - Total recents capped at recentCap.
 */
export function composeShellMenu(opts: ComposeShellMenuOptions): ShellMenuEntry[] {
  const { pinnedPaths, recentPaths, recentCap } = opts
  const entries: ShellMenuEntry[] = []
  const seen = new Set<string>()

  for (const p of pinnedPaths) {
    if (!p || p.trim().length === 0) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ label: labelOf(p), path: p, isPinned: true })
  }

  let recents = 0
  for (const p of recentPaths) {
    if (recents >= recentCap) break
    if (!p || p.trim().length === 0) continue
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ label: labelOf(p), path: p, isPinned: false })
    recents++
  }

  return entries
}
