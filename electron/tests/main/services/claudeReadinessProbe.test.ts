import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { probeClaudeReadiness } from '../../../src/main/services/claudeReadinessProbe'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claudeprobe-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe('probeClaudeReadiness', () => {
  it('returns false when homeDir does not exist', async () => {
    const result = await probeClaudeReadiness(path.join(tmpDir, 'nonexistent-home'))
    expect(result).toBe(false)
  })

  it('returns true when homeDir exists and is writable (no .claude dir)', async () => {
    // tmpDir itself is our "home" — it exists and is writable
    const result = await probeClaudeReadiness(tmpDir)
    expect(result).toBe(true)
  })

  it('probes inside .claude dir when it exists', async () => {
    const claudeDir = path.join(tmpDir, '.claude')
    await fs.mkdir(claudeDir)

    const result = await probeClaudeReadiness(tmpDir)
    expect(result).toBe(true)

    // Probe file must be cleaned up
    const probeFile = path.join(claudeDir, '.ccmc-write-probe')
    const probeExists = await fs.access(probeFile).then(() => true).catch(() => false)
    expect(probeExists).toBe(false)
  })

  it('leaves no probe file in homeDir', async () => {
    await probeClaudeReadiness(tmpDir)
    const probeFile = path.join(tmpDir, '.ccmc-write-probe')
    const exists = await fs.access(probeFile).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('returns true when homeDir is the actual os.homedir()', async () => {
    // Integration: real home dir should be writable
    const result = await probeClaudeReadiness(os.homedir())
    expect(result).toBe(true)
  })
})
