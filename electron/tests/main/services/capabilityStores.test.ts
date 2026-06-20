/**
 * Integration tests for the command/skill list stores against a real temp
 * filesystem. Complements the pure-parser unit tests by exercising the actual
 * directory walking + readFileUtf8 path, and locks in the "skip skill dirs
 * without SKILL.md" fix (no phantom entries).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { listCommands } from '../../../src/main/services/commandStore'
import { listSkills } from '../../../src/main/services/skillStore'

let root: string
let project: string

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ccmc-cap-'))
  project = path.join(root, 'proj')

  const commandsDir = path.join(project, '.claude', 'commands')
  await fs.mkdir(commandsDir, { recursive: true })
  await fs.writeFile(
    path.join(commandsDir, 'review.md'),
    '---\ndescription: Review the diff\n---\n# Review\n',
  )
  await fs.writeFile(path.join(commandsDir, 'deploy.md'), '# Deploy\nno frontmatter\n')
  // A non-markdown file must be ignored.
  await fs.writeFile(path.join(commandsDir, 'README.txt'), 'not a command\n')

  const skillsDir = path.join(project, '.claude', 'skills')
  await fs.mkdir(path.join(skillsDir, 'my-skill'), { recursive: true })
  await fs.writeFile(
    path.join(skillsDir, 'my-skill', 'SKILL.md'),
    '---\nname: pretty-name\ndescription: does things\n---\n',
  )
  // A subdirectory WITHOUT a SKILL.md must NOT appear (phantom-entry guard).
  await fs.mkdir(path.join(skillsDir, 'not-a-skill'), { recursive: true })
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('listCommands (fs integration)', () => {
  it('lists .md commands sorted by name with frontmatter descriptions', async () => {
    const commands = await listCommands(project)
    expect(commands.map((c) => c.name)).toEqual(['deploy', 'review'])
    expect(commands.find((c) => c.name === 'review')?.description).toBe('Review the diff')
    expect(commands.find((c) => c.name === 'deploy')?.description).toBeNull()
  })

  it('ignores non-markdown files', async () => {
    const commands = await listCommands(project)
    expect(commands.some((c) => c.name.toLowerCase().includes('readme'))).toBe(false)
  })

  it('returns [] when the commands dir is absent', async () => {
    expect(await listCommands(path.join(root, 'no-such-project'))).toEqual([])
  })
})

describe('listSkills (fs integration)', () => {
  it('lists only directories that contain a SKILL.md, using frontmatter name', async () => {
    const skills = await listSkills(project)
    expect(skills.map((s) => s.name)).toEqual(['pretty-name'])
    expect(skills[0].description).toBe('does things')
  })

  it('excludes subdirectories without a SKILL.md (no phantom entries)', async () => {
    const skills = await listSkills(project)
    expect(skills.some((s) => s.name === 'not-a-skill')).toBe(false)
  })

  it('returns [] when the skills dir is absent', async () => {
    expect(await listSkills(path.join(root, 'no-such-project'))).toEqual([])
  })
})
