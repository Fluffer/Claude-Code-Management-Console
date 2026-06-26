import { cp, stat } from 'node:fs/promises'
import path from 'node:path'
import { cloneRepo } from './gitRunner'

/**
 * Duplicates a project folder into a new location, either as a clean local
 * `git clone` (tracked files + history only) or an exact recursive filesystem
 * copy (everything, including .git / node_modules / .env). Never throws.
 */
export interface DuplicateOptions {
  sourcePath: string
  targetDir: string
  mode: 'git' | 'copy'
}

export async function duplicateProject(
  opts: DuplicateOptions,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const { sourcePath, mode } = opts
  const src = path.resolve(sourcePath)
  const dst = path.resolve(opts.targetDir)

  let srcStat
  try {
    srcStat = await stat(src)
  } catch {
    return { ok: false, error: `Source folder not found: ${src}` }
  }
  if (!srcStat.isDirectory()) {
    return { ok: false, error: 'Source is not a folder.' }
  }

  if (dst === src || dst.startsWith(src + path.sep)) {
    return { ok: false, error: 'Cannot duplicate a folder into itself.' }
  }

  try {
    await stat(dst)
    return { ok: false, error: `Target folder already exists: ${dst}` }
  } catch {
    // does not exist → safe to proceed
  }

  if (mode === 'git') {
    try {
      await stat(path.join(src, '.git'))
    } catch {
      return { ok: false, error: 'Source is not a git repository.' }
    }
    try {
      return await cloneRepo(src, dst)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  try {
    await cp(src, dst, { recursive: true })
    return { ok: true, path: dst }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
