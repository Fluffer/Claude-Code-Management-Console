import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { hasClaudeMd, claudeMdFilename } from '../../core/projects/projectClaudeInfo'

/**
 * Returns the full path to CLAUDE.md if it exists in `projectPath`, or null.
 * Mirrors C# ProjectClaudeInfo.ClaudeMdPath.
 */
export async function claudeMdPath(projectPath: string): Promise<string | null> {
  let filenames: string[]
  try {
    filenames = await fs.readdir(projectPath)
  } catch {
    return null
  }

  const filename = claudeMdFilename(filenames)
  return filename ? path.join(projectPath, filename) : null
}

/**
 * Returns true if CLAUDE.md exists in `projectPath`.
 * Mirrors C# ProjectClaudeInfo.HasClaudeMd.
 */
export async function hasClaudeMdInProject(projectPath: string): Promise<boolean> {
  let filenames: string[]
  try {
    filenames = await fs.readdir(projectPath)
  } catch {
    return false
  }

  return hasClaudeMd(filenames)
}
