import * as fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import type { AppState } from '../../core/models'
import { parseState, serializeState } from '../../core/config/configSerialization'
import { writeFileAtomic, readFileUtf8 } from '../os/atomicFile'
import { withFileLock } from '../os/fileMutex'

/**
 * Loads state.json synchronously — used at startup to seed values that must
 * be available before the first async tick (e.g. cachedCloseToTray in
 * shellIntegration). Absent file or any error returns default AppState.
 */
export function loadStateSync(statePath: string): AppState {
  try {
    return parseState(readFileSync(statePath, 'utf8'))
  } catch {
    return parseState('{}')
  }
}

/**
 * Loads state.json from `statePath`.
 * - Absent file → returns default AppState.
 * - Corrupt/invalid → returns default AppState silently (state is not precious).
 * - IO error → returns default without touching the file.
 *
 * Matches C# StateService.Load semantics: corrupt state is replaced with
 * defaults without quarantine (unlike config, there is no .bad rename).
 */
export async function loadState(statePath: string): Promise<AppState> {
  const contents = await readFileUtf8(statePath)
  if (contents === null) return parseState('{}')
  return parseState(contents)
}

/**
 * Saves `state` to `statePath` atomically (UTF-8 without BOM).
 * Creates parent directories as needed.
 */
export async function saveState(statePath: string, state: AppState): Promise<void> {
  const dir = path.dirname(statePath)
  await fs.mkdir(dir, { recursive: true })
  const serialized = serializeState(state)
  await writeFileAtomic(statePath, serialized)
}

/**
 * Read-modify-write state.json under a per-path lock. Mirrors updateConfig:
 * concurrent partial updates (pushing a recent launch, re-keying a renamed
 * project) each see the previous one's result instead of racing it.
 */
export async function updateState(
  statePath: string,
  mutate: (current: AppState) => AppState,
): Promise<AppState> {
  return withFileLock(statePath, async () => {
    const current = await loadState(statePath)
    const next = mutate(current)
    await saveState(statePath, next)
    return next
  })
}
