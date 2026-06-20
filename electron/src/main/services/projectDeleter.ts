import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'

/**
 * Deletes a project folder permanently (recursive).
 *
 * Safety guards ported from C# ProjectDeleter:
 *  - Normalises path (resolves relative segments, trims trailing separators).
 *  - Throws if the folder does not exist.
 *  - On read-only files (e.g. Git objects/pack files), clears the read-only
 *    attribute and retries — matching C# DeletePermanent retry logic.
 *
 * Note: The C# implementation also supports Recycle Bin via a Windows Shell
 * API (SHFileOperationW). That path is Windows-only and requires native
 * interop; the Electron port exposes only `permanent: true` behaviour
 * (which is the default for the delete feature). Recycle Bin support can be
 * added later via a native addon.
 *
 * @param projectPath Absolute path to the project folder (trailing separators are trimmed).
 */
export async function deleteProject(projectPath: string): Promise<void> {
  const normalised = path.resolve(projectPath.replace(/[/\\]+$/, ''))

  let exists = false
  try {
    const stat = await fs.stat(normalised)
    exists = stat.isDirectory()
  } catch {
    exists = false
  }

  if (!exists) {
    throw new Error(`Project folder not found: ${normalised}`)
  }

  try {
    await fs.rm(normalised, { recursive: true, force: false })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // Read-only files (Git pack/object files) cause EPERM/EACCES on Windows.
    // Clear the attribute on all entries and retry once — mirrors C# retry logic.
    if (code === 'EPERM' || code === 'EACCES') {
      await clearReadOnly(normalised)
      await fs.rm(normalised, { recursive: true, force: false })
    } else {
      throw err
    }
  }
}

/**
 * Recursively clears the read-only attribute (chmod 0o666) on every file
 * under `dirPath`. Mirrors C# `File.SetAttributes(entry, FileAttributes.Normal)`.
 */
async function clearReadOnly(dirPath: string): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await clearReadOnly(full)
    } else {
      try {
        await fs.chmod(full, 0o666)
      } catch {
        // best-effort — skip files we cannot chmod
      }
    }
  }
}
