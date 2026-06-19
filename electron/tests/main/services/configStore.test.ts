import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadConfig, saveConfig } from '../../../src/main/services/configStore'
import { createDefaultConfig } from '../../../src/core/config/configSerialization'
import type { LauncherConfig } from '../../../src/core/models'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'configStore-'))
})

afterEach(async () => {
  // Allow any fire-and-forget snapshot I/O to finish before removing the temp dir.
  // On Windows, fs.copyFile can briefly hold a file lock that makes fs.rm EBUSY.
  await new Promise<void>((resolve) => setTimeout(resolve, 200))
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

function configPath(): string {
  return path.join(tmpDir, 'config.json')
}

describe('loadConfig', () => {
  it('returns default config when file is absent', async () => {
    const result = await loadConfig(configPath())
    expect(result).toEqual(createDefaultConfig())
  })

  it('parses a valid config file', async () => {
    const cfg: LauncherConfig = {
      roots: ['C:\\Projects'],
      defaultRoot: 'C:\\Projects',
      ignore: [],
      hidden: [],
      projects: {},
    }
    await saveConfig(configPath(), cfg)

    const result = await loadConfig(configPath())
    expect(result.roots).toEqual(['C:\\Projects'])
    expect(result.defaultRoot).toBe('C:\\Projects')
  })

  it('returns default and quarantines corrupt file', async () => {
    const cp = configPath()
    await fs.mkdir(path.dirname(cp), { recursive: true })
    await fs.writeFile(cp, 'not valid json{{{', 'utf8')

    const result = await loadConfig(cp)
    expect(result).toEqual(createDefaultConfig())

    // Corrupt file should be renamed to .bad
    const bad = cp + '.bad'
    const badExists = await fs.access(bad).then(() => true).catch(() => false)
    expect(badExists).toBe(true)

    // Original file should be gone
    const origExists = await fs.access(cp).then(() => true).catch(() => false)
    expect(origExists).toBe(false)
  })

  it('overwrites existing .bad file when quarantining', async () => {
    const cp = configPath()
    await fs.mkdir(path.dirname(cp), { recursive: true })
    const bad = cp + '.bad'
    await fs.writeFile(bad, 'old bad content', 'utf8')
    await fs.writeFile(cp, '{{invalid}}', 'utf8')

    const result = await loadConfig(cp)
    expect(result).toEqual(createDefaultConfig())

    const badContent = await fs.readFile(bad, 'utf8')
    expect(badContent).toBe('{{invalid}}')
  })
})

describe('saveConfig', () => {
  it('writes a file that can be read back', async () => {
    const cfg: LauncherConfig = {
      roots: ['/home/user/projects'],
      defaultRoot: null,
      ignore: [],
      hidden: [],
      projects: {
        '/home/user/myapp': { lastUsed: '2024-01-01T00:00:00Z', flags: '--dangerously-skip-permissions' },
      },
    }

    await saveConfig(configPath(), cfg)

    const result = await loadConfig(configPath())
    expect(result.roots).toEqual(['/home/user/projects'])
    expect(result.projects?.['/home/user/myapp']?.flags).toBe('--dangerously-skip-permissions')
  })

  it('creates parent directories if missing', async () => {
    const cp = path.join(tmpDir, 'sub', 'config.json')
    await saveConfig(cp, createDefaultConfig())

    const exists = await fs.access(cp).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('takes a snapshot after saving', async () => {
    await saveConfig(configPath(), createDefaultConfig())

    // Allow snapshot to complete (it's async/best-effort)
    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    const snapshotDir = path.join(tmpDir, 'snapshots')
    const entries = await fs.readdir(snapshotDir).catch(() => [])
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]).toMatch(/^config-\d{8}-\d{6}\.json$/)
  })

  it('prunes snapshots beyond the 10-keep limit', async () => {
    const cp = configPath()
    const cfg = createDefaultConfig()

    // Save 12 times — should keep only 10 snapshots
    for (let i = 0; i < 12; i++) {
      await saveConfig(cp, cfg)
      // Small delay so timestamps differ
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 200))

    const snapshotDir = path.join(tmpDir, 'snapshots')
    const entries = await fs.readdir(snapshotDir).catch(() => [])
    const snapshots = entries.filter((f) => f.startsWith('config-') && f.endsWith('.json'))
    expect(snapshots.length).toBeLessThanOrEqual(10)
  })

  it('writes UTF-8 without BOM', async () => {
    await saveConfig(configPath(), createDefaultConfig())

    const buf = await fs.readFile(configPath())
    expect(buf[0]).not.toBe(0xef)
  })
})
