/**
 * Integration test for the refresh-storm fix.
 *
 * Wires watchPaths + selfWriteTracker + writeFileAtomic exactly the way main.ts
 * does — same explicit config/state paths, real filesystem, real chokidar. A
 * write the app makes itself must not reach the renderer; an edit made outside
 * the app still must. Mocking any of the three would prove nothing here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { watchPaths, type Disposer } from '../../../src/main/os/fileWatch'
import { writeFileAtomic } from '../../../src/main/os/atomicFile'
import { consumeSelfWrite, clearSelfWrites } from '../../../src/main/os/selfWriteTracker'

let tmpDir: string
let statePath: string
let configPath: string
let disposer: Disposer | null = null

const settle = (ms = 700): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selfwrite-watch-'))
  statePath = path.join(tmpDir, 'state.json')
  configPath = path.join(tmpDir, 'config.json')
  await fs.writeFile(statePath, '{}', 'utf8')
  await fs.writeFile(configPath, '{}', 'utf8')
  clearSelfWrites()
})

afterEach(async () => {
  if (disposer) {
    await disposer()
    disposer = null
  }
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})

/**
 * Starts a watcher wired like main.ts and collects the paths that would have
 * been pushed to the renderer.
 */
async function startWatcher(): Promise<string[]> {
  const forwardedToRenderer: string[] = []
  disposer = watchPaths([configPath, statePath], (changed) => {
    const external = changed.filter((p) => !consumeSelfWrite(p))
    forwardedToRenderer.push(...external)
  })
  await settle(300) // let chokidar finish its initial scan
  return forwardedToRenderer
}

describe('watcher + self-write suppression', () => {
  it("does not notify the renderer about the app's own write", async () => {
    const forwarded = await startWatcher()

    // What pinning a project does: the app writes state.json itself.
    await writeFileAtomic(statePath, '{"pinned":["C:\\\\Dev\\\\proj"]}')
    await settle()

    expect(forwarded).toEqual([])
  })

  it('still notifies the renderer about an edit made outside the app', async () => {
    const forwarded = await startWatcher()

    // Someone edits config.json in an editor — not through writeFileAtomic.
    await fs.writeFile(configPath, '{"roots":["C:\\\\Dev"]}', 'utf8')
    await settle()

    expect(forwarded.length).toBeGreaterThanOrEqual(1)
    expect(forwarded.some((p) => p.endsWith('config.json'))).toBe(true)
  })

  it('notifies about an external edit that follows one of our own writes', async () => {
    const forwarded = await startWatcher()

    await writeFileAtomic(statePath, '{"sortMode":"Name"}')
    await settle()
    expect(forwarded).toEqual([])

    await fs.writeFile(statePath, '{"sortMode":"LastUsed"}', 'utf8')
    await settle()
    expect(forwarded.length).toBeGreaterThanOrEqual(1)
  })

  it('suppresses a burst of app writes without masking a later external edit', async () => {
    const forwarded = await startWatcher()

    // What a launch does: stamp config.json, then push state.json.
    await writeFileAtomic(configPath, '{"projects":{}}')
    await writeFileAtomic(statePath, '{"recentLaunches":[]}')
    await settle()
    expect(forwarded).toEqual([])

    await fs.writeFile(configPath, '{"roots":[]}', 'utf8')
    await settle()
    expect(forwarded.some((p) => p.endsWith('config.json'))).toBe(true)
  })
})
