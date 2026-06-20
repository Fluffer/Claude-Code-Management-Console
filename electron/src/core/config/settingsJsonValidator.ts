/**
 * Validates a project's .claude/settings.json content parses as JSON.
 * An absent file (null content) is valid; a present-but-broken file surfaces an error,
 * because Claude silently ignores a malformed settings.json.
 *
 * Pure logic only — file I/O is the caller's responsibility.
 */

export interface SettingsValidationResult {
  isValid: boolean
  error: string | null
}

/**
 * @param content The raw file content, or null if the file does not exist.
 */
export function validateSettingsJson(content: string | null): SettingsValidationResult {
  if (content === null) {
    return { isValid: true, error: null }
  }

  try {
    JSON.parse(content)
    return { isValid: true, error: null }
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : String(err)
    return { isValid: false, error: message }
  }
}
