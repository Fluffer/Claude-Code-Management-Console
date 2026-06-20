import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Writes `contents` (UTF-8 without BOM) to `filePath` atomically:
 * write to a temp file in the same directory, then rename over the target.
 * A crash mid-write never truncates the real file.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = filePath + '.tmp'
  await fs.writeFile(tmp, contents, { encoding: 'utf8' })
  await fs.rename(tmp, filePath)
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
