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
import { withFileLock } from '../os/fileMutex'

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

  // parseConfig swallows a parse error and returns defaults, so corruption is
  // detected here first — quarantine before falling back, and parse only once
  // on the healthy path.
  try {
    JSON.parse(contents)
  } catch {
    await quarantineFile(configPath)
    return createDefaultConfig()
  }

  return parseConfig(contents)
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

/**
 * Read-modify-write config.json under a per-path lock, so two concurrent
 * mutations cannot both load the same starting state and overwrite each other.
 * Returns the config that was saved.
 *
 * Use this for every partial update (stamping lastUsed, adding a root,
 * re-keying a renamed project). A whole-snapshot `saveConfig` from the renderer
 * still replaces the file wholesale — the lock stops it interleaving with a
 * main-side update, but it cannot make a stale snapshot fresh.
 */
export async function updateConfig(
  configPath: string,
  mutate: (current: LauncherConfig) => LauncherConfig,
): Promise<LauncherConfig> {
  return withFileLock(configPath, async () => {
    const current = await loadConfig(configPath)
    const next = mutate(current)
    await saveConfig(configPath, next)
    return next
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
