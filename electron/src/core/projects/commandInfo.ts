import type { CommandInfo } from '../models'
import { parseFrontmatter } from '../config/frontmatter'

/**
 * Builds a CommandInfo from a command file's basename and content.
 * Name is the basename without the `.md` extension (the slash-command name).
 * Description comes from `description:` frontmatter when present.
 */
export function toCommandInfo(filename: string, content: string | null): CommandInfo {
  const name = filename.replace(/\.md$/i, '')
  const fm = parseFrontmatter(content)
  const description = fm['description'] ? fm['description'] : null
  return { name, description }
}
