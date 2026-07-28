import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { markSelfWrite } from './selfWriteTracker'

/** Distinguishes concurrent writers so two never share one temp file. */
let writeCounter = 0

/** Transient Windows rename failures worth retrying. */
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_RETRY_DELAYS_MS = [15, 40, 90]

/**
 * Renames with a short backoff. On Windows a rename over an existing file
 * fails transiently whenever anything else holds the target open for even a
 * moment — an antivirus scanner, the search indexer, another writer landing at
 * the same instant. Without the retry that surfaces as a silently lost save.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (attempt >= RENAME_RETRY_DELAYS_MS.length || !TRANSIENT_RENAME_CODES.has(code)) {
        throw err
      }
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]))
    }
  }
}

/**
 * Writes `contents` (UTF-8 without BOM) to `filePath` atomically:
 * write to a unique temp file in the same directory, then rename over the
 * target. A crash mid-write never truncates the real file.
 *
 * The temp name carries a pid + counter suffix because a shared `<file>.tmp`
 * lets two concurrent writes to the same target clobber each other's temp and
 * rename a half-written mixture into place.
 *
 * Every write is recorded with markSelfWrite so the file watcher can suppress
 * the echo event this write is about to produce.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tmp = `${filePath}.${process.pid}.${writeCounter++}.tmp`
  try {
    await fs.writeFile(tmp, contents, { encoding: 'utf8' })
    markSelfWrite(filePath)
    await renameWithRetry(tmp, filePath)
  } catch (err) {
    // Never leave a stray temp behind when the write or rename fails.
    await fs.unlink(tmp).catch(() => undefined)
    throw err
  }
}

/**
 * Reads a file as UTF-8. Returns null if the file does not exist.
 * Other errors propagate.
 */
export async function readFileUtf8(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, { encoding: 'utf8' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}
