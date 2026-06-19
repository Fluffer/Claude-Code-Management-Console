// source: LaunchGroup.cs
// Persisted: embedded in AppState (state.json). System.Text.Json default = camelCase.
// JSON keys: name, projectPaths
/** A named set of project paths launched together ("open this stack"). Order is preserved. */
export interface LaunchGroup {
  name: string;
  projectPaths: string[];
}
