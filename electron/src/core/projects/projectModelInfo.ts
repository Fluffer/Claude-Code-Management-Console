/**
 * Resolves the effective default Claude model from settings.json content.
 *
 * The pure layer operates on pre-read JSON strings.
 *
 * TODO Phase 3: implement resolveDefaultModel(projectPath, userSettingsPath?) as an
 * fs wrapper that reads <project>/.claude/settings.json and ~/.claude/settings.json,
 * passing their contents to readModel().
 */

/**
 * Extracts the "model" string value from a settings.json content string.
 * Returns null when the file is missing/blank/invalid or when the model value
 * is absent, non-string, or whitespace-only.
 */
export function readModel(jsonContent: string | null): string | null {
  if (!jsonContent) return null
  try {
    const parsed: unknown = JSON.parse(jsonContent)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (!('model' in obj)) return null
    const value = obj['model']
    if (typeof value !== 'string') return null
    return value.trim() ? value : null
  } catch {
    return null
  }
}

/**
 * Resolves the effective model: project settings win over user settings.
 * Both arguments are raw JSON strings (or null if the file does not exist).
 */
export function resolveDefaultModel(
  projectSettingsJson: string | null,
  userSettingsJson: string | null,
): string | null {
  return readModel(projectSettingsJson) ?? readModel(userSettingsJson)
}
