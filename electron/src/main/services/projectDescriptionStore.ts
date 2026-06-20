import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const MAX_READ_BYTES = 4096

/** Cache entry: mtime (ms since epoch) + result description string. */
interface CacheEntry {
  mtimeMs: number
  desc: string | null
}

const cache = new Map<string, CacheEntry>()

/**
 * Reads up to 4096 bytes from `filePath`. Returns null on ENOENT or any IO error.
 * Mirrors C# ProjectDescription.ReadHead.
 */
async function readHead(filePath: string): Promise<string | null> {
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(MAX_READ_BYTES)
      const { bytesRead } = await handle.read(buf, 0, MAX_READ_BYTES, 0)
      return buf.toString('utf8', 0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return null
    return null
  }
}

/**
 * Reads a file with mtime-based caching. Returns null if not found.
 * Mirrors C# ProjectDescription.FromFile.
 */
async function fromFile(filePath: string): Promise<string | null> {
  try {
    let stat: { mtimeMs: number }
    try {
      stat = await fs.stat(filePath)
    } catch {
      return null
    }

    const hit = cache.get(filePath)
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.desc

    const content = await readHead(filePath)
    if (content === null) {
      cache.set(filePath, { mtimeMs: stat.mtimeMs, desc: null })
      return null
    }

    const { extract } = await import('../../core/projects/projectDescription')
    const desc = extract(content) ?? null
    cache.set(filePath, { mtimeMs: stat.mtimeMs, desc })
    return desc
  } catch {
    return null
  }
}

/**
 * Returns the project description for `projectPath`.
 * Reads README.md then CLAUDE.md (up to 4096 bytes), caches by mtime.
 * Mirrors C# ProjectDescription.Get.
 */
export async function getProjectDescription(projectPath: string): Promise<string> {
  for (const candidate of ['README.md', 'CLAUDE.md']) {
    const desc = await fromFile(path.join(projectPath, candidate))
    if (desc) return desc
  }
  return ''
}

/** Clears the mtime cache (useful in tests). */
export function clearDescriptionCache(): void {
  cache.clear()
}
