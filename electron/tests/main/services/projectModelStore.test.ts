import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { resolveProjectModel } from '../../../src/main/services/projectModelStore'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projmodel-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function writeSettings(dir: string, content: object): Promise<string> {
  const filePath = path.join(dir, 'settings.json')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(content), 'utf8')
  return filePath
}

describe('resolveProjectModel', () => {
  it('returns null when neither settings file exists', async () => {
    const result = await resolveProjectModel(
      tmpDir,
      path.join(tmpDir, 'nonexistent', 'settings.json'),
    )
    expect(result).toBeNull()
  })

  it('returns model from project settings', async () => {
    const projectClaudeDir = path.join(tmpDir, 'proj', '.claude')
    await writeSettings(projectClaudeDir, { model: 'claude-opus-4-5' })

    const result = await resolveProjectModel(
      path.join(tmpDir, 'proj'),
      path.join(tmpDir, 'user-settings.json'),
    )
    expect(result).toBe('claude-opus-4-5')
  })

  it('returns model from user settings when project settings absent', async () => {
    const userSettingsPath = path.join(tmpDir, 'user', 'settings.json')
    await fs.mkdir(path.dirname(userSettingsPath), { recursive: true })
    await fs.writeFile(userSettingsPath, JSON.stringify({ model: 'claude-sonnet-4-5' }), 'utf8')

    const result = await resolveProjectModel(
      path.join(tmpDir, 'proj-without-settings'),
      userSettingsPath,
    )
    expect(result).toBe('claude-sonnet-4-5')
  })

  it('project model wins over user model', async () => {
    const projectClaudeDir = path.join(tmpDir, 'proj', '.claude')
    await writeSettings(projectClaudeDir, { model: 'claude-opus-4-5' })

    const userSettingsPath = path.join(tmpDir, 'user', 'settings.json')
    await fs.mkdir(path.dirname(userSettingsPath), { recursive: true })
    await fs.writeFile(
      userSettingsPath,
      JSON.stringify({ model: 'claude-sonnet-4-5' }),
      'utf8',
    )

    const result = await resolveProjectModel(path.join(tmpDir, 'proj'), userSettingsPath)
    expect(result).toBe('claude-opus-4-5')
  })

  it('ignores whitespace-only model values', async () => {
    const projectClaudeDir = path.join(tmpDir, 'proj', '.claude')
    await writeSettings(projectClaudeDir, { model: '   ' })

    const result = await resolveProjectModel(
      path.join(tmpDir, 'proj'),
      path.join(tmpDir, 'nonexistent.json'),
    )
    expect(result).toBeNull()
  })

  it('handles invalid JSON gracefully', async () => {
    const projectClaudeDir = path.join(tmpDir, 'proj', '.claude')
    await fs.mkdir(projectClaudeDir, { recursive: true })
    await fs.writeFile(path.join(projectClaudeDir, 'settings.json'), '{invalid}', 'utf8')

    const result = await resolveProjectModel(
      path.join(tmpDir, 'proj'),
      path.join(tmpDir, 'nonexistent.json'),
    )
    expect(result).toBeNull()
  })
})
