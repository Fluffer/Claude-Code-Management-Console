import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { scanProjects } from '../../../src/main/services/projectScanner'
import type { LauncherConfig } from '../../../src/core/models'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devprojects-scan-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

function makeConfig(overrides: Partial<LauncherConfig> = {}): LauncherConfig {
  return {
    roots: [root],
    defaultRoot: null,
    ignore: [],
    hidden: [],
    projects: {},
    ...overrides,
  }
}

describe('scanProjects', () => {
  it('finds direct subfolders only', async () => {
    await fs.mkdir(path.join(root, 'Alpha'))
    await fs.mkdir(path.join(root, 'Beta'))
    await fs.mkdir(path.join(root, 'Beta', 'Nested')) // must NOT appear

    const projects = await scanProjects(makeConfig())
    const names = projects.map((p) => p.name).sort()
    expect(names).toEqual(['Alpha', 'Beta'])
  })

  it('skips dot-prefixed folders', async () => {
    await fs.mkdir(path.join(root, '.git'))
    await fs.mkdir(path.join(root, 'Visible'))

    const projects = await scanProjects(makeConfig())
    expect(projects.map((p) => p.name)).toEqual(['Visible'])
  })

  it('skips ignored names case-insensitively', async () => {
    await fs.mkdir(path.join(root, 'Notes'))
    await fs.mkdir(path.join(root, 'Keep'))

    const projects = await scanProjects(makeConfig({ ignore: ['notes'] }))
    expect(projects.map((p) => p.name)).toEqual(['Keep'])
  })

  it('returns empty array for missing roots', async () => {
    const config = makeConfig({ roots: [path.join(root, 'does-not-exist')] })
    const projects = await scanProjects(config)
    expect(projects).toEqual([])
  })

  it('attaches lastUsedUtc and flags from config keeping UTC', async () => {
    await fs.mkdir(path.join(root, 'Tracked'))
    const fullPath = path.join(root, 'Tracked')
    const config = makeConfig({
      projects: {
        [fullPath]: { lastUsed: '2026-06-06T14:30:00Z', flags: '--model opus' },
      },
    })

    const projects = await scanProjects(config)
    const project = projects[0]
    expect(project.flags).toBe('--model opus')
    expect(project.lastUsedUtc).not.toBeNull()
    // Should be a valid ISO UTC string
    const parsed = new Date(project.lastUsedUtc!)
    expect(parsed.getUTCFullYear()).toBe(2026)
    expect(parsed.getUTCMonth()).toBe(5) // June = 5
    expect(parsed.getUTCDate()).toBe(6)
    expect(parsed.getUTCHours()).toBe(14)
    expect(parsed.getUTCMinutes()).toBe(30)
  })

  it('returns null lastUsedUtc and empty flags for unknown projects', async () => {
    await fs.mkdir(path.join(root, 'Fresh'))

    const projects = await scanProjects(makeConfig())
    expect(projects).toHaveLength(1)
    expect(projects[0].lastUsedUtc).toBeNull()
    expect(projects[0].flags).toBe('')
  })

  it('fills description from README.md', async () => {
    const proj = path.join(root, 'Alpha')
    await fs.mkdir(proj)
    await fs.writeFile(path.join(proj, 'README.md'), '# Alpha\nDoes alpha things.')

    const projects = await scanProjects(makeConfig())
    expect(projects[0].description).toBe('Does alpha things.')
  })

  it('returns empty description when no README or CLAUDE.md', async () => {
    await fs.mkdir(path.join(root, 'Bare'))

    const projects = await scanProjects(makeConfig())
    expect(projects[0].description).toBe('')
  })

  it('skips hidden paths case-insensitively', async () => {
    const secret = path.join(root, 'Secret')
    await fs.mkdir(secret)
    await fs.mkdir(path.join(root, 'Keep'))

    const projects = await scanProjects(makeConfig({ hidden: [secret.toUpperCase()] }))
    expect(projects.map((p) => p.name)).toEqual(['Keep'])
  })

  it('hidden does not match by name alone — requires full path', async () => {
    await fs.mkdir(path.join(root, 'Tools'))

    // Hidden list points to a completely different path
    const projects = await scanProjects(
      makeConfig({ hidden: ['C:\\Somewhere\\Else\\Tools'] }),
    )
    expect(projects.map((p) => p.name)).toEqual(['Tools'])
  })

  it('sets correct root, name, and path on ProjectInfo', async () => {
    await fs.mkdir(path.join(root, 'MyProj'))

    const projects = await scanProjects(makeConfig())
    expect(projects[0].root).toBe(root)
    expect(projects[0].name).toBe('MyProj')
    expect(projects[0].path).toBe(path.join(root, 'MyProj'))
  })

  it('handles multiple roots', async () => {
    const root2 = await fs.mkdtemp(path.join(os.tmpdir(), 'devprojects-scan2-'))
    try {
      await fs.mkdir(path.join(root, 'ProjA'))
      await fs.mkdir(path.join(root2, 'ProjB'))

      const projects = await scanProjects(makeConfig({ roots: [root, root2] }))
      const names = projects.map((p) => p.name).sort()
      expect(names).toEqual(['ProjA', 'ProjB'])
    } finally {
      await fs.rm(root2, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
})
