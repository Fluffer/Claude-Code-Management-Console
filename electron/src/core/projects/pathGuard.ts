/**
 * Confinement checks for paths that arrive over IPC.
 *
 * The renderer is trusted content, but it is still the least-trusted part of
 * the app: it renders project names, README text and .mcp.json contents. Any
 * handler that writes, deletes, executes or hands a path to the OS shell should
 * therefore refuse paths outside the user's configured source roots, the same
 * way git:clone and project:duplicate already do.
 *
 * Resolution matters more than prefix matching: 'C:\Dev\Active\p\..\..\Windows'
 * has a configured-root prefix as a string but resolves outside it.
 */
import * as path from 'path'

/** Resolved, lower-cased, without a trailing separator. */
function canonical(p: string): string {
  return path.resolve(p).replace(/[/\\]+$/, '').toLowerCase()
}

/** True when `candidate` resolves to one of the configured roots itself. */
export function isConfiguredRoot(
  candidate: string,
  roots: readonly string[] | null | undefined,
): boolean {
  if (!roots || roots.length === 0) return false
  const target = canonical(candidate)
  return roots.some((r) => canonical(r) === target)
}

/**
 * True when `candidate` resolves strictly inside one of the roots — a project
 * folder or something beneath it, never a root itself.
 *
 * Use for destructive operations (rename, move, delete): a configured root is
 * not a project and must not be renamed or deleted as if it were one.
 */
export function isInsideRoots(
  candidate: string,
  roots: readonly string[] | null | undefined,
): boolean {
  if (!roots || roots.length === 0) return false
  const target = canonical(candidate)
  return roots.some((r) => {
    const root = canonical(r)
    return target.startsWith(root + path.sep) || target.startsWith(root + '/')
  })
}

/**
 * True when `candidate` resolves inside one of the roots, or is a root itself.
 * Use for read/open operations, where opening a root folder is legitimate.
 */
export function isWithinRoots(
  candidate: string,
  roots: readonly string[] | null | undefined,
): boolean {
  return isConfiguredRoot(candidate, roots) || isInsideRoots(candidate, roots)
}

/** Message shown when a path fails confinement. Deliberately does not echo the path. */
export const OUTSIDE_ROOTS_MESSAGE =
  'That path is outside your configured source roots.'
