// source: LauncherConfig.cs
// Persisted: %APPDATA%\ccmc\config.json — backward-compatible with the original PowerShell
// launcher. System.Text.Json default = camelCase.
// JSON keys: roots, defaultRoot, ignore, hidden, projects
// ProjectUsage JSON keys: lastUsed, flags
/**
 * Persisted launcher configuration. Schema is backward-compatible with the
 * original PowerShell launcher's config.json (camelCase keys).
 */
export interface LauncherConfig {
  roots: string[] | null;
  defaultRoot: string | null;
  ignore: string[] | null;
  /** Full project paths hidden from the console via "Hide from console". */
  hidden: string[] | null;
  projects: Record<string, ProjectUsage> | null;
}

/** Per-project usage data stored in config.json. */
export interface ProjectUsage {
  /** ISO-8601 round-trip UTC timestamp, or null if never launched. */
  lastUsed: string | null;
  flags: string | null;
}
