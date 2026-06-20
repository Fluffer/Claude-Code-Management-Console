import type { SkillInfo } from '../models'
import { parseFrontmatter } from '../config/frontmatter'

/**
 * Builds a SkillInfo from a skill directory name and its SKILL.md content.
 * Name prefers frontmatter `name`, falling back to the directory name.
 * Description comes from `description:` frontmatter when present.
 */
export function toSkillInfo(dirName: string, content: string | null): SkillInfo {
  const fm = parseFrontmatter(content)
  const name = fm['name'] ? fm['name'] : dirName
  const description = fm['description'] ? fm['description'] : null
  return { name, description }
}
