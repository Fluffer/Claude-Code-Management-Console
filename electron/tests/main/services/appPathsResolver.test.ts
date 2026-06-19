import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { tryMigrateLegacy, resolveAppDataDir } from '../../../src/main/services/appPathsResolver'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apppaths-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('resolveAppDataDir', () => {
  it('returns path joined with ccmc', () => {
    const result = resolveAppDataDir(tmpDir)
    expect(result).toBe(path.join(tmpDir, 'ccmc'))
  })
})

describe('tryMigrateLegacy', () => {
  it('does nothing when ccmc dir already exists', async () => {
    const ccmc = path.join(tmpDir, 'ccmc')
    await fs.mkdir(ccmc)
    await fs.writeFile(path.join(ccmc, 'existing.json'), '{}')

    // Create legacy dir too
    const legacy = path.join(tmpDir, 'Dev-Projects')
    await fs.mkdir(legacy)
    await fs.writeFile(path.join(legacy, 'config.json'), '{"roots":[]}')

    await tryMigrateLegacy(tmpDir)

    // ccmc should be untouched (existing.json still there, no config.json added)
    const existingPath = path.join(ccmc, 'existing.json')
    const existingExists = await fs.access(existingPath).then(() => true).catch(() => false)
    expect(existingExists).toBe(true)

    const importedPath = path.join(ccmc, 'config.json')
    const importedExists = await fs.access(importedPath).then(() => true).catch(() => false)
    expect(importedExists).toBe(false)
  })

  it('does nothing when legacy dir does not exist', async () => {
    await tryMigrateLegacy(tmpDir)

    const ccmc = path.join(tmpDir, 'ccmc')
    const exists = await fs.access(ccmc).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('copies legacy folder to ccmc when ccmc does not exist', async () => {
    const legacy = path.join(tmpDir, 'Dev-Projects')
    await fs.mkdir(legacy)
    await fs.writeFile(path.join(legacy, 'config.json'), '{"roots":["/projects"]}')

    await tryMigrateLegacy(tmpDir)

    const ccmc = path.join(tmpDir, 'ccmc')
    const configPath = path.join(ccmc, 'config.json')
    const content = await fs.readFile(configPath, 'utf8')
    expect(content).toBe('{"roots":["/projects"]}')
  })

  it('copies nested subdirectories', async () => {
    const legacy = path.join(tmpDir, 'Dev-Projects')
    await fs.mkdir(path.join(legacy, 'snapshots'), { recursive: true })
    await fs.writeFile(path.join(legacy, 'snapshots', 'snap.json'), '{}')

    await tryMigrateLegacy(tmpDir)

    const snapPath = path.join(tmpDir, 'ccmc', 'snapshots', 'snap.json')
    const exists = await fs.access(snapPath).then(() => true).catch(() => false)
    expect(exists).toBe(true)
  })

  it('does not overwrite existing files in ccmc (no-overwrite semantics)', async () => {
    // Simulate partial migration: ccmc doesn't exist yet, so migration runs
    // But the overwrite:false test is for copyDirectory internals
    // We test via the full flow: first migration copies, second call is no-op
    const legacy = path.join(tmpDir, 'Dev-Projects')
    await fs.mkdir(legacy)
    await fs.writeFile(path.join(legacy, 'config.json'), 'original')

    await tryMigrateLegacy(tmpDir)

    // Modify legacy after migration
    await fs.writeFile(path.join(legacy, 'config.json'), 'modified')

    // Run migration again — ccmc now exists, so it should skip
    await tryMigrateLegacy(tmpDir)

    const content = await fs.readFile(path.join(tmpDir, 'ccmc', 'config.json'), 'utf8')
    expect(content).toBe('original')
  })

  it('cleans up staging dir if it exists before copying', async () => {
    const staging = path.join(tmpDir, 'ccmc.migrating')
    await fs.mkdir(staging)
    await fs.writeFile(path.join(staging, 'stale.json'), 'stale')

    const legacy = path.join(tmpDir, 'Dev-Projects')
    await fs.mkdir(legacy)
    await fs.writeFile(path.join(legacy, 'config.json'), 'fresh')

    await tryMigrateLegacy(tmpDir)

    const ccmc = path.join(tmpDir, 'ccmc')
    const configPath = path.join(ccmc, 'config.json')
    const content = await fs.readFile(configPath, 'utf8')
    expect(content).toBe('fresh')
  })
})
