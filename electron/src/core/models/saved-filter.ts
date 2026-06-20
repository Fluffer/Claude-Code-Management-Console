// source: SavedFilter.cs
// Persisted: embedded in AppState (state.json). System.Text.Json default = camelCase.
// JSON keys: name, pathContains, requireGit, requireClaudeMd, requireRunning, requirePinned
/**
 * A named, reusable project filter. Each condition is opt-in (null/false = "don't care").
 * All set conditions are ANDed. Stored on AppState; surfaced as a sidebar entry.
 */
export interface SavedFilter {
  name: string;
  pathContains: string | null;
  requireGit: boolean;
  requireClaudeMd: boolean;
  requireRunning: boolean;
  requirePinned: boolean;
}
