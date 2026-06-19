import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getAppDataDir } from '../../core/util/appPaths'

const LEGACY_FOLDER_NAME = 'Dev-Projects'

/**
 * Copies a directory tree recursively (no-overwrite semantics on files).
 * Mirrors C# AppPaths.CopyDirectory.
 */
async function copyDirectory(source: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })

  const entries = await fs.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath)
    } else {
      // overwrite: false — mirrors C# File.Copy(src, dest, overwrite: false)
      try {
        await fs.copyFile(srcPath, destPath, fs.constants.COPYFILE_EXCL)
      } catch {
        // Already exists — skip (no-overwrite)
      }
    }
  }
}

/**
 * Performs a one-time migration from the legacy `Dev-Projects` folder to the
 * new `ccmc` folder. Mirrors C# AppPaths.TryMigrateLegacy:
 *
 *  - If `ccmc` already exists → already migrated; return immediately.
 *  - If the legacy folder does not exist → nothing to migrate; return.
 *  - Copy to a staging dir (`ccmc.migrating`), then atomically rename to `ccmc`.
 *  - An interrupted copy leaves `ccmc.migrating`; clean it up first.
 *  - Any IO error is swallowed (best-effort).
 *
 * @param appDataBase The platform's app-data root (e.g. %APPDATA% on Windows).
 */
export async function tryMigrateLegacy(appDataBase: string): Promise<void> {
  const appDir = getAppDataDir(appDataBase)
  const legacy = path.join(appDataBase, LEGACY_FOLDER_NAME)
  const staging = appDir + '.migrating'

  try {
    // Already migrated (or fresh install that ran once)
    try {
      await fs.access(appDir)
      return
    } catch {
      // appDir does not exist — proceed
    }

    // Nothing to migrate
    try {
      await fs.access(legacy)
    } catch {
      return
    }

    // Clean up any previous interrupted staging dir
    try {
      await fs.rm(staging, { recursive: true, force: true })
    } catch {
      // ignore
    }

    await copyDirectory(legacy, staging)
    await fs.rename(staging, appDir)
  } catch {
    // Best-effort — a locked/denied legacy folder must never take startup down
  }
}

/**
 * Returns the resolved app-data directory path.
 * This is a thin wrapper around the pure `getAppDataDir`; real main-process
 * code calls `tryMigrateLegacy` first, then this.
 */
export function resolveAppDataDir(appDataBase: string): string {
  return getAppDataDir(appDataBase)
}
