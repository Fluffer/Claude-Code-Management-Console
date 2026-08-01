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

  // The source-root watcher's configuration: a new project is a new directory,
  // and nothing below the root's immediate children is worth descending into.
  describe('watchDirectories', () => {
    it('ignores a new subdirectory by default', async () => {
      let called = false
      const disposer = watchPaths([tmpDir], () => { called = true })

      await new Promise<void>((resolve) => setTimeout(resolve, 300))
      await fs.mkdir(path.join(tmpDir, 'new-project'))
      await new Promise<void>((resolve) => setTimeout(resolve, 600))
      await disposer()

      expect(called).toBe(false)
    }, 8000)

    it('reports a new subdirectory when enabled', async () => {
      const changed: string[] = []
      const disposer = watchPaths([tmpDir], (paths) => { changed.push(...paths) }, {
        depth: 0,
        watchDirectories: true,
      })

      await new Promise<void>((resolve) => setTimeout(resolve, 300))
      const projectDir = path.join(tmpDir, 'new-project')
      await fs.mkdir(projectDir)
      await new Promise<void>((resolve) => setTimeout(resolve, 600))
      await disposer()

      expect(changed).toContain(projectDir)
    }, 8000)

    it('reports a removed subdirectory when enabled', async () => {
      const projectDir = path.join(tmpDir, 'doomed-project')
      await fs.mkdir(projectDir)

      const changed: string[] = []
      const disposer = watchPaths([tmpDir], (paths) => { changed.push(...paths) }, {
        depth: 0,
        watchDirectories: true,
      })

      await new Promise<void>((resolve) => setTimeout(resolve, 300))
      await fs.rm(projectDir, { recursive: true, force: true })
      await new Promise<void>((resolve) => setTimeout(resolve, 600))
      await disposer()

      expect(changed).toContain(projectDir)
    }, 8000)

    it('does not descend past the root at depth 0', async () => {
      // A project's own contents (node_modules and friends) must not register —
      // that recursion is what makes watching source roots expensive.
      const projectDir = path.join(tmpDir, 'proj')
      const nested = path.join(projectDir, 'node_modules')
      await fs.mkdir(nested, { recursive: true })

      const changed: string[] = []
      const disposer = watchPaths([tmpDir], (paths) => { changed.push(...paths) }, {
        depth: 0,
        watchDirectories: true,
      })

      await new Promise<void>((resolve) => setTimeout(resolve, 300))
      await fs.writeFile(path.join(nested, 'dep.js'), 'module.exports = 1', 'utf8')
      await new Promise<void>((resolve) => setTimeout(resolve, 600))
      await disposer()

      expect(changed).toEqual([])
    }, 8000)
  })
})
