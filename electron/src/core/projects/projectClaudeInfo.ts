/**
 * Pure logic for detecting CLAUDE.md presence in a project.
 *
 * TODO Phase 3: implement claudeMdPath(projectPath) and hasClaudeMd(projectPath)
 * as fs wrappers that call path.join(projectPath, 'CLAUDE.md') and check existence.
 */

/**
 * Returns true if 'CLAUDE.md' appears in the provided list of filenames
 * (case-sensitive, matching the real filesystem check).
 */
export function hasClaudeMd(filenames: string[]): boolean {
  return filenames.includes('CLAUDE.md')
}

/**
 * Returns 'CLAUDE.md' if it appears in filenames, otherwise null.
 * Mirrors C# ClaudeInfo.ClaudeMdPath logic (the path-joining is Phase 3).
 */
export function claudeMdFilename(filenames: string[]): string | null {
  return hasClaudeMd(filenames) ? 'CLAUDE.md' : null
}
