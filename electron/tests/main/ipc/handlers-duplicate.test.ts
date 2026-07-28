import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHandlers } from '../../../src/main/ipc/handlers'
import type { IpcHandlerDeps } from '../../../src/main/ipc/handlers'

let work: string
let configPath: string

async function makeDeps(roots: string[]): Promise<IpcHandlerDeps> {
  configPath = path.join(work, 'config.json')
  await writeFile(configPath, JSON.stringify({ roots, defaultRoot: roots[0] ?? null, hidden: [] }))
  return {
    configPath,
    statePath: path.join(work, 'state.json'),
    claudeDir: path.join(work, 'claude'),
    processInspector: {} as IpcHandlerDeps['processInspector'],
    sessionKiller: {} as IpcHandlerDeps['sessionKiller'],
    terminalLauncher: {} as IpcHandlerDeps['terminalLauncher'],
    commandLocator: {} as IpcHandlerDeps['commandLocator'],
    pickFolder: async () => ({ path: null }),
    openPath: async () => '',
    openExternal: vi.fn().mockResolvedValue(undefined),
    openInVscode: async () => ({ ok: false }),
    approver: { init: vi.fn(), status: vi.fn(), set: vi.fn(), dispose: vi.fn() } as unknown as IpcHandlerDeps['approver'],
  } as IpcHandlerDeps
}

beforeEach(async () => { work = await mkdtemp(path.join(tmpdir(), 'dup-ipc-')) })
afterEach(async () => { await rm(work, { recursive: true, force: true }) })

describe('project:duplicate', () => {
  it('rejects a target root that is not configured', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: path.join(work, 'other'), name: 'src-copy', mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/source root/i)
  })

  it('rejects an invalid name', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: root, name: 'bad/name', mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/separator/i)
  })

  it('rejects an invalid copy mode', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: root, name: 'src-copy', mode: 'symlink' as 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/mode/i)
  })

  it('rejects a source path outside every configured root', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const outside = path.join(work, 'outside'); await mkdir(outside)
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: outside, targetRoot: root, name: 'x-copy', mode: 'copy' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/source/i)
  })

  it('copies the project into the configured root', async () => {
    const root = path.join(work, 'root'); await mkdir(root)
    const src = path.join(root, 'src'); await mkdir(src)
    await writeFile(path.join(src, 'file.txt'), 'hi')
    const handlers = createHandlers(await makeDeps([root]))
    const res = await handlers['project:duplicate']({ sourcePath: src, targetRoot: root, name: 'src-copy', mode: 'copy' })
    expect(res.ok).toBe(true)
    expect(res.path).toBe(path.join(root, 'src-copy'))
    expect((await stat(path.join(root, 'src-copy', 'file.txt'))).isFile()).toBe(true)
  })
})
