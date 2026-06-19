import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { watchPaths } from '../../../src/main/os/fileWatch'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fileWatch-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('watchPaths', () => {
  it('calls onChange when a watched file changes', async () => {
    const filePath = path.join(tmpDir, 'watched.txt')
    await fs.writeFile(filePath, 'initial', 'utf8')

    let callCount = 0
    const disposer = watchPaths([tmpDir], () => { callCount++ })

    // Wait for chokidar to initialize
    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    await fs.writeFile(filePath, 'changed', 'utf8')

    // Wait for debounce (150ms) plus some buffer
    await new Promise<void>((resolve) => setTimeout(resolve, 600))

    await disposer()
    expect(callCount).toBeGreaterThanOrEqual(1)
  }, 8000)

  it('debounces rapid changes into a single callback', async () => {
    const filePath = path.join(tmpDir, 'debounce.txt')
    await fs.writeFile(filePath, 'v0', 'utf8')

    let callCount = 0
    const disposer = watchPaths([tmpDir], () => { callCount++ })

    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    // Rapid successive writes
    await fs.writeFile(filePath, 'v1', 'utf8')
    await fs.writeFile(filePath, 'v2', 'utf8')
    await fs.writeFile(filePath, 'v3', 'utf8')

    // Wait for debounce to settle
    await new Promise<void>((resolve) => setTimeout(resolve, 600))

    await disposer()
    // Should have fired 1 or at most 2 times (debounced), not 3
    expect(callCount).toBeGreaterThanOrEqual(1)
    expect(callCount).toBeLessThanOrEqual(2)
  }, 8000)

  it('returns a disposer that stops callbacks after disposal', async () => {
    const filePath = path.join(tmpDir, 'dispose.txt')
    await fs.writeFile(filePath, 'initial', 'utf8')

    let callCount = 0
    const disposer = watchPaths([tmpDir], () => { callCount++ })

    await new Promise<void>((resolve) => setTimeout(resolve, 300))
    await disposer()

    // Write after disposal — should not trigger callback
    await fs.writeFile(filePath, 'post-dispose', 'utf8')
    await new Promise<void>((resolve) => setTimeout(resolve, 400))

    expect(callCount).toBe(0)
  }, 8000)

  it('watches newly created files in the directory', async () => {
    let called = false
    const disposer = watchPaths([tmpDir], () => { called = true })

    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    const newFile = path.join(tmpDir, 'new.txt')
    await fs.writeFile(newFile, 'hello', 'utf8')

    await new Promise<void>((resolve) => setTimeout(resolve, 600))
    await disposer()

    expect(called).toBe(true)
  }, 8000)
})
