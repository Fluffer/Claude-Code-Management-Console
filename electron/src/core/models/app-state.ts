// source: AppState.cs
// Persisted: %APPDATA%\ccmc\state.json. System.Text.Json default = camelCase.
// JSON keys: theme, sortMode, pinned, onboardingDismissed, accent, font,
//            recentLaunches, profiles, groups, savedFilters, closeToTray
import type { LaunchProfile } from './launch-profile'
import type { LaunchGroup } from './launch-group'
import type { SavedFilter } from './saved-filter'

/**
 * UI state stored in a separate state.json so config.json keeps its original
 * schema and stays compatible with the PowerShell launcher.
 */
export interface AppState {
  /** "System", "Light", "Dark", or a palette name (e.g. "Dracula", "Nord"). */
  theme: string;
  /** "LastUsed" or "Name". */
  sortMode: string;
  /** Full paths of pinned projects (shown first in the list). */
  pinned: string[];
  onboardingDismissed: boolean;
  /** Accent color name ("Default" follows the system accent). */
  accent: string;
  /** UI font family name. */
  font: string;
  /** Most-recently-launched project paths, newest first. Capped on write. */
  recentLaunches: string[];
  /** Reusable named launcher-flag bundles (Tier 2). Applied to a project's saved flags. */
  profiles: LaunchProfile[];
  /** Saved multi-project launch groups (Tier 2). Launched in listed order. */
  groups: LaunchGroup[];
  /** Saved project filters (Tier 3), surfaced as sidebar entries. */
  savedFilters: SavedFilter[];
  /** When true, the window close button hides to the tray instead of exiting. */
  closeToTray: boolean;
}
