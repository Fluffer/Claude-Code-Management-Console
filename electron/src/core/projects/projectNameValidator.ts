/** Validates a new project name. Pure logic — filesystem checks are injected by caller. */

const INVALID_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']

/**
 * Returns a user-facing error message, or null when the name is valid.
 * @param name The candidate project name.
 * @param existsCheck Called with the trimmed name; returns true if a file/folder already exists.
 * @param root Optional root path for inclusion in the "already exists" message.
 */
function getError(
  name: string,
  existsCheck: (trimmedName: string) => boolean,
  root?: string
): string | null {
  if (!name || !name.trim()) {
    return 'Project name cannot be empty.'
  }

  for (const ch of INVALID_CHARS) {
    if (name.includes(ch)) {
      return 'Project name contains invalid characters: < > : " / \\ | ? *'
    }
  }

  const trimmed = name.trim()
  if (existsCheck(trimmed)) {
    const location = root ? ` in ${root}` : ''
    return `A folder named '${trimmed}' already exists${location}.`
  }

  return null
}

export const projectNameValidator = { getError, INVALID_CHARS }
