import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadState, saveState } from '../../../src/main/services/stateStore'
import type { AppState } from '../../../src/core/models'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stateStore-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function statePath(): string {
  return path.join(tmpDir, 'state.json')
}

const defaultState: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: [],
  onboardingDismissed: false,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [],
  groups: [],
  savedFilters: [],
  closeToTray: false,
}

describe('loadState', () => {
  it('returns default AppState when file is absent', async () => {
    const result = await loadState(statePath())
    expect(result).toEqual(defaultState)
  })

  it('parses a valid state file', async () => {
    const state: AppState = {
      ...defaultState,
      theme: 'Dark',
      sortMode: 'Name',
      pinned: ['/home/user/project'],
      onboardingDismissed: true,
    }
    await saveState(statePath(), state)

    const result = await loadState(statePath())
    expect(result.theme).toBe('Dark')
    expect(result.sortMode).toBe('Name')
    expect(result.pinned).toEqual(['/home/user/project'])
    expect(result.onboardingDismissed).toBe(true)
  })

  it('returns default on corrupt JSON without quarantine', async () => {
    const sp = statePath()
    await fs.mkdir(path.dirname(sp), { recursive: true })
    await fs.writeFile(sp, 'not json at all', 'utf8')

    const result = await loadState(sp)
    expect(result).toEqual(defaultState)

    // State does NOT quarantine — file should remain
    const stillExists = await fs.access(sp).then(() => true).catch(() => false)
    expect(stillExists).toBe(true)

    // No .bad file created
    const badExists = await fs.access(sp + '.bad').then(() => true).catch(() => false)
    expect(badExists).toBe(false)
  })

  it('backfills missing fields with defaults', async () => {
    const sp = statePath()
    await fs.mkdir(path.dirname(sp), { recursive: true })
    // Partial state — missing most fields
    await fs.writeFile(sp, '{"theme": "Light"}', 'utf8')

    const result = await loadState(sp)
    expect(result.theme).toBe('Light')
    expect(result.sortMode).toBe('LastUsed')
    expect(result.pinned).toEqual([])
    expect(result.closeToTray).toBe(false)
  })
})

describe('saveState', () => {
  it('writes a file that can be read back', async () => {
    const state: AppState = {
      ...defaultState,
      theme: 'Dracula',
      closeToTray: true,
    }
    await saveState(statePath(), state)

    const result = await loadState(statePath())
    expect(result.theme).toBe('Dracula')
    expect(result.closeToTray).toBe(true)
  })

  it('creates parent directories if missing', async () => {
    const sp = path.join(tmpDir, 'nested', 'state.json')
    await saveState(sp, defaultState)

    const exists = await fs.access(sp).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('writes UTF-8 without BOM', async () => {
    await saveState(statePath(), defaultState)

    const buf = await fs.readFile(statePath())
    expect(buf[0]).not.toBe(0xef)
  })

  it('atomic write — replaces existing file', async () => {
    await saveState(statePath(), defaultState)
    const modified: AppState = { ...defaultState, theme: 'Nord' }
    await saveState(statePath(), modified)

    const result = await loadState(statePath())
    expect(result.theme).toBe('Nord')
  })
})
