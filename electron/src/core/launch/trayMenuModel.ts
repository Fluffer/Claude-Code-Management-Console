/**
 * Pure model for the system-tray context menu.
 * Mirrors the menu shape produced by C# TrayIconService.ShowMenu (lines ~159-198):
 * pinned entries first, a separator only when both pinned and recent entries exist,
 * then recent entries, then (always) separator + "Open ccmc" + "Exit".
 * Pure — no Node.js or Electron imports.
 */

import { ShellMenuEntry } from './shellMenuComposer'

export type TrayMenuItem =
  | { kind: 'project'; label: string; path: string }
  | { kind: 'separator' }
  | { kind: 'empty'; label: string }
  | { kind: 'open'; label: string }
  | { kind: 'exit'; label: string }

/**
 * Builds the ordered list of tray menu items from composed shell entries.
 * - Pinned entries appear first.
 * - A separator is inserted before the first non-pinned entry when at least one
 *   pinned entry precedes it (pinned → recents divider).
 * - When entries is empty, an "empty" placeholder item is emitted.
 * - Always ends with: separator, open, exit.
 */
export function buildTrayMenuModel(entries: readonly ShellMenuEntry[]): TrayMenuItem[] {
  const items: TrayMenuItem[] = []

  let anyPinned = false
  let dividerEmitted = false

  for (const entry of entries) {
    if (entry.isPinned) {
      anyPinned = true
    } else if (anyPinned && !dividerEmitted) {
      items.push({ kind: 'separator' })
      dividerEmitted = true
    }
    items.push({ kind: 'project', label: entry.label, path: entry.path })
  }

  if (entries.length === 0) {
    items.push({ kind: 'empty', label: 'No recent projects' })
  }

  items.push({ kind: 'separator' })
  items.push({ kind: 'open', label: 'Open ccmc' })
  items.push({ kind: 'exit', label: 'Exit' })

  return items
}
