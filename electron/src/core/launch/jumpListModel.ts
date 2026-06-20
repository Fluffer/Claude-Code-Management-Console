/**
 * Pure model for the Windows taskbar jump list.
 * Mirrors C# JumpListService: pinned entries in a "Pinned" category, recent entries
 * (capped at 8) in a "Recent" category. Categories with no items are omitted.
 * Jump-list args use the entry label (not path), matching C# MakeLink which calls
 * DeepLinkBuilder.Build(entry.Label).
 * Pure — no Node.js or Electron imports.
 */

import { ShellMenuEntry } from './shellMenuComposer'
import { deepLinkBuilder } from '../links/deepLinkBuilder'

export interface JumpListTask {
  type: 'task'
  program: string
  args: string
  title: string
  description: string
}

export interface JumpListCategory {
  name: string
  items: JumpListTask[]
}

const RECENT_CAP = 8

function makeTask(entry: ShellMenuEntry, exePath: string): JumpListTask {
  return {
    type: 'task',
    program: exePath,
    args: deepLinkBuilder.build(entry.label),
    title: entry.label,
    description: `Launch Claude in ${entry.label}`,
  }
}

/**
 * Builds jump-list categories from composed shell entries and the executable path.
 * - "Pinned" category: all entries where isPinned is true.
 * - "Recent" category: all entries where isPinned is false, capped at 8.
 * - Empty categories are omitted (mirrors C# AppendCategory early-return on count==0).
 */
export function buildJumpListCategories(
  entries: readonly ShellMenuEntry[],
  exePath: string,
): JumpListCategory[] {
  const pinnedItems = entries
    .filter((e) => e.isPinned)
    .map((e) => makeTask(e, exePath))

  const recentItems = entries
    .filter((e) => !e.isPinned)
    .slice(0, RECENT_CAP)
    .map((e) => makeTask(e, exePath))

  const categories: JumpListCategory[] = []

  if (pinnedItems.length > 0) {
    categories.push({ name: 'Pinned', items: pinnedItems })
  }
  if (recentItems.length > 0) {
    categories.push({ name: 'Recent', items: recentItems })
  }

  return categories
}
