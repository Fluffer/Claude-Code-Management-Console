/**
 * Pure helper: derive a free target folder name for duplicating a project.
 *
 * Returns `<sourceName>-copy` when no sibling folder collides, otherwise the
 * first free `<sourceName>-copy-N` (N starting at 2). Comparison against the
 * sibling list is case-insensitive. No I/O — callers still run the result
 * through validateCloneName.
 */
export function deriveDuplicateName(sourceName: string, siblings: string[]): string {
  const taken = new Set(siblings.map((s) => s.toLowerCase()))
  const base = `${sourceName}-copy`
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base}-${n}`.toLowerCase())) n++
  return `${base}-${n}`
}
