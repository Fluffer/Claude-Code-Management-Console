import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CommandInfo } from '../../core/models'
import { toCommandInfo } from '../../core/projects/commandInfo'
import { readFileUtf8 } from '../os/atomicFile'

const COMMANDS_DIR = path.join('.claude', 'commands')

/**
 * Lists Claude slash commands in <projectPath>/.claude/commands/*.md.
 * Returns an empty array when the directory is absent. Sorted by name.
 */
export async function listCommands(projectPath: string): Promise<CommandInfo[]> {
  const dir = path.join(projectPath, COMMANDS_DIR)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const mdFiles = entries.filter((f) => f.toLowerCase().endsWith('.md'))
  const infos = await Promise.all(
    mdFiles.map(async (file) => {
      const content = await readFileUtf8(path.join(dir, file))
      return toCommandInfo(file, content)
    }),
  )
  return infos.sort((a, b) => a.name.localeCompare(b.name))
}
