import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { SkillInfo } from '../../core/models'
import { toSkillInfo } from '../../core/projects/skillInfo'
import { readFileUtf8 } from '../os/atomicFile'

const SKILLS_DIR = path.join('.claude', 'skills')

/**
 * Lists Claude skills in <projectPath>/.claude/skills/*\/SKILL.md.
 * Each skill is a subdirectory containing a SKILL.md. Returns an empty array
 * when the skills directory is absent. Sorted by name.
 */
export async function listSkills(projectPath: string): Promise<SkillInfo[]> {
  const dir = path.join(projectPath, SKILLS_DIR)
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs = entries.filter((e) => e.isDirectory())
  const infos = await Promise.all(
    dirs.map(async (d) => {
      const content = await readFileUtf8(path.join(dir, d.name, 'SKILL.md'))
      return toSkillInfo(d.name, content)
    }),
  )
  return infos.sort((a, b) => a.name.localeCompare(b.name))
}
