import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { projectNameValidator } from '../../core/projects/projectNameValidator'

/**
 * Creates a new project folder under `root`.
 *
 * Validation is delegated to the core `projectNameValidator.getError`.
 * Mirrors C# ProjectNameValidator.CreateProjectFolder.
 *
 * @param root Absolute path to the root folder (must exist).
 * @param name New project name (trimmed internally).
 * @returns The full path to the created folder.
 * @throws Error if root does not exist, name is invalid, or target already exists.
 */
export async function createProjectFolder(root: string, name: string): Promise<string> {
  // Verify root exists
  let rootExists = false
  try {
    const stat = await fs.stat(root)
    rootExists = stat.isDirectory()
  } catch {
    rootExists = false
  }
  if (!rootExists) {
    throw new Error(`Root folder does not exist: ${root}`)
  }

  const trimmed = name.trim()
  const targetPath = path.join(root, trimmed)

  // Existence check is async; we pass a sync stub to getError for name-only validation,
  // then run the async check separately.
  const nameError = projectNameValidator.getError(trimmed, () => false)
  if (nameError !== null) throw new Error(nameError)

  // Async target-exists check
  let targetExists = false
  try {
    await fs.access(targetPath)
    targetExists = true
  } catch {
    targetExists = false
  }
  if (targetExists) {
    throw new Error(`A folder named '${trimmed}' already exists in ${root}.`)
  }

  await fs.mkdir(targetPath, { recursive: false })
  return targetPath
}
