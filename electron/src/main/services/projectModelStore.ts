import * as path from 'node:path'
import { resolveDefaultModel } from '../../core/projects/projectModelInfo'
import { readFileUtf8 } from '../os/atomicFile'

/**
 * Resolves the effective default Claude model for a project.
 *
 * Reads `<projectPath>/.claude/settings.json` first, then `userSettingsPath`.
 * Passes raw JSON strings to the core `resolveDefaultModel` function.
 *
 * Mirrors C# ProjectModelInfo.ResolveDefaultModel.
 *
 * @param projectPath Absolute path to the project folder.
 * @param userSettingsPath Path to the user settings.json (defaults to
 *   `~/.claude/settings.json` via the homeDir parameter).
 */
export async function resolveProjectModel(
  projectPath: string,
  userSettingsPath: string,
): Promise<string | null> {
  const projectSettingsPath = path.join(projectPath, '.claude', 'settings.json')
  const [projectJson, userJson] = await Promise.all([
    readFileUtf8(projectSettingsPath),
    readFileUtf8(userSettingsPath),
  ])
  return resolveDefaultModel(projectJson, userJson)
}
