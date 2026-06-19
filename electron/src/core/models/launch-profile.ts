// source: LaunchProfile.cs
// Persisted: embedded in AppState (state.json). System.Text.Json default = camelCase.
// JSON keys: name, model, permissionMode, allowedTools, disallowedTools
/**
 * A named, reusable bundle of launcher flags (Tier-2 generalization of the per-row
 * model picker). Stored launcher-side in AppState — applying a profile writes its
 * composed flags into a project's saved flags; it never mutates the project's real
 * .claude/settings.json.
 */
export interface LaunchProfile {
  name: string;
  model: string | null;
  permissionMode: string | null;
  allowedTools: string[];
  disallowedTools: string[];
}
