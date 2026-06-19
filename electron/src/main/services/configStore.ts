import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { LauncherConfig } from '../../core/models'
import {
  parseConfig,
  serializeConfig,
  createDefaultConfig,
} from '../../core/config/configSerialization'
import {
  generateSnapshotFilename,
  selectFilesToPrune,
} from '../../core/config/configSnapshot'
import { writeFileAtomic, readFileUtf8 } from '../os/atomicFile'

const SNAPSHOT_KEEP = 10

/**
 * Loads config.json from `configPath`.
 * - Absent file → returns default LauncherConfig (does NOT save — load is read-only).
 * - Corrupt JSON → quarantines file as `<configPath>.bad` (timestamped suffix),
 *   returns default. Never throws to caller.
 * - IO/permission error → returns default without touching the file.
 */
export async function loadConfig(configPath: string): Promise<LauncherConfig> {
  const contents = await readFileUtf8(configPath)
  if (contents === null) return createDefaultConfig()

  const parsed = parseConfig(contents)
  // parseConfig returns createDefaultConfig() on JSON parse error, but we need
  // to detect corruption to quarantine the file. Re-check by attempting JSON.parse.
  try {
    JSON.parse(contents)
  } catch {
    // Corrupt JSON — quarantine best-effort
    await quarantineFile(configPath)
    return createDefaultConfig()
  }

  return parsed
}

async function quarantineFile(configPath: string): Promise<void> {
  try {
    const bad = configPath + '.bad'
    // Remove any existing .bad file first (mirrors C# ConfigService.QuarantineCorruptFile)
    try {
      await fs.unlink(bad)
    } catch {
      // ignore if not present
    }
    await fs.rename(configPath, bad)
  } catch {
    // Best-effort — quarantine failure must not throw
  }
}

/**
 * Saves `config` to `configPath` atomically (UTF-8 without BOM).
 * After a successful write, takes a best-effort timestamped snapshot in the
 * sibling `snapshots/` directory, keeping the 10 most recent.
 * Snapshot failure never blocks the save.
 */
export async function saveConfig(configPath: string, config: LauncherConfig): Promise<void> {
  const dir = path.dirname(configPath)
  await fs.mkdir(dir, { recursive: true })

  const serialized = serializeConfig(config)
  await writeFileAtomic(configPath, serialized)

  // Best-effort snapshot
  void takeSnapshot(configPath).catch(() => {
    // swallow — snapshot failure must never propagate
  })
}

async function takeSnapshot(configPath: string): Promise<void> {
  const snapshotDir = path.join(path.dirname(configPath), 'snapshots')
  await fs.mkdir(snapshotDir, { recursive: true })

  const filename = generateSnapshotFilename(new Date())
  const dest = path.join(snapshotDir, filename)

  // Copy the saved file to snapshot
  await fs.copyFile(configPath, dest)

  // Prune old snapshots
  const entries = await fs.readdir(snapshotDir)
  const snapshots = entries.filter((f) => f.startsWith('config-') && f.endsWith('.json'))
  const toDelete = selectFilesToPrune(snapshots, SNAPSHOT_KEEP)
  for (const name of toDelete) {
    try {
      await fs.unlink(path.join(snapshotDir, name))
    } catch {
      // best-effort
    }
  }
}
