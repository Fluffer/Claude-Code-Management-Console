import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { projectNameValidator } from '../../core/projects/projectNameValidator'

/**
 * Renames a project folder in place. Returns the new full path.
 *
 * Mirrors C# ProjectMover.Rename:
 *  - Validates the new name via `projectNameValidator.getError`.
 *  - Case-only rename (myproj → MyProj): goes via a temp name to work around
 *    NTFS case-insensitive rename restrictions.
 *  - Returns the new path on success.
 *
 * @param projectPath Full path to the existing project folder.
 * @param newName     Desired new folder name (trimmed internally).
 */
export async function renameProject(projectPath: string, newName: string): Promise<string> {
  const normalised = projectPath.replace(/[/\\]+$/, '')
  const parent = path.dirname(normalised)
  const trimmed = newName.trim()
  const oldName = path.basename(normalised)
  const destination = path.join(parent, trimmed)

  // Case-only rename: e.g. "myproj" → "MyProj"
  if (oldName.toLowerCase() === trimmed.toLowerCase() && oldName !== trimmed) {
    for (const ch of projectNameValidator.INVALID_CHARS) {
      if (trimmed.includes(ch)) {
        throw new Error('Project name contains invalid characters: < > : " / \\ | ? *')
      }
    }
    const temp = destination + '.renaming-tmp'
    await fs.rename(normalised, temp)
    await fs.rename(temp, destination)
    return destination
  }

  // Normal rename — validate name and target existence
  const existsCheck = async (name: string): Promise<boolean> => {
    try {
      await fs.access(path.join(parent, name))
      return true
    } catch {
      return false
    }
  }

  const error = projectNameValidator.getError(trimmed, () => {
    // Synchronous check is not possible here; we use async existence check below.
    // Return false for the name-only pass, then do async check separately.
    return false
  })

  if (error !== null) throw new Error(error)

  // Check existence asynchronously (the validator's existsCheck is sync, so we re-check here)
  if (await existsCheck(trimmed)) {
    throw new Error(`A folder named '${trimmed}' already exists in ${parent}.`)
  }

  await fs.rename(normalised, destination)
  return destination
}

/**
 * Moves a project folder (keeping its name) under a different root.
 * Returns the new full path.
 *
 * Mirrors C# ProjectMover.MoveToRoot safety guards:
 *  - Target root must exist.
 *  - Source and target must be on the same drive/volume.
 *  - Target root must not be inside the project being moved.
 *  - Project must not already be in that root.
 *  - A folder with the same name must not already exist in the target root.
 *
 * @param projectPath Absolute path to the project folder.
 * @param targetRoot  Absolute path to the destination root folder.
 */
export async function moveProjectToRoot(
  projectPath: string,
  targetRoot: string,
): Promise<string> {
  const normProject = path.resolve(projectPath.replace(/[/\\]+$/, ''))
  const normTarget = path.resolve(targetRoot.replace(/[/\\]+$/, ''))

  // Target root must exist
  let targetExists = false
  try {
    const stat = await fs.stat(normTarget)
    targetExists = stat.isDirectory()
  } catch {
    targetExists = false
  }
  if (!targetExists) {
    throw new Error(`Target root does not exist: ${targetRoot}`)
  }

  // Same drive/volume check (cross-volume rename not supported)
  const projectRoot = path.parse(normProject).root.toLowerCase()
  const targetRootVol = path.parse(normTarget).root.toLowerCase()
  if (projectRoot !== targetRootVol) {
    throw new Error(
      'Cannot move a project to a different drive — choose a root on the same drive.',
    )
  }

  // Target must not be inside the project (append sep to avoid prefix match on sibling)
  const projectWithSep = normProject + path.sep
  const targetWithSep = normTarget + path.sep
  if (targetWithSep.startsWith(projectWithSep)) {
    throw new Error('Cannot move a project into one of its own subfolders.')
  }

  const name = path.basename(normProject)
  const destination = path.join(normTarget, name)

  // Must not already be there
  if (path.resolve(destination).toLowerCase() === normProject.toLowerCase()) {
    throw new Error('The project is already in that root.')
  }

  // No collision in target
  let destinationExists = false
  try {
    await fs.access(destination)
    destinationExists = true
  } catch {
    destinationExists = false
  }
  if (destinationExists) {
    throw new Error(`A folder named '${name}' already exists in ${targetRoot}.`)
  }

  await fs.rename(normProject, destination)
  return destination
}
