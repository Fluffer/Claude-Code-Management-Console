import type { LauncherConfig, ProjectUsage, AppState } from '../models'
import type { LaunchProfile } from '../models/launch-profile'
import type { LaunchGroup } from '../models/launch-group'
import type { SavedFilter } from '../models/saved-filter'

// ---------------------------------------------------------------------------
// System.Text.Json default encoder replication
//
// The C# ConfigService uses JsonSerializerOptions with NO custom encoder,
// which means it uses the default JavaScriptEncoder.Default. That encoder
// escapes the following characters to \uXXXX for HTML-safety:
//   < (U+003C), > (U+003E), & (U+0026), + (U+002B), ' (U+0027)
// It also escapes " (U+0022) as " — though standard JSON also escapes
// this as \", the .NET default encoder uses " form.
// All non-ASCII code points (> U+007E) are also escaped to \uXXXX.
//
// Encoder: JavaScriptEncoder.Default (NOT UnsafeRelaxedJsonEscaping).
// Indentation: 2 spaces, \n line endings.
// No trailing newline at EOF.
// Null properties: written (no DefaultIgnoreCondition = IgnoreNull).
// Property order: declared order in C# class (replicated below by explicit key ordering).
// ---------------------------------------------------------------------------

/**
 * Characters that System.Text.Json's default encoder escapes to \uXXXX
 * beyond the standard JSON escapes (backslash, control chars, double-quote).
 * Note: " is written as " by the default encoder (not \").
 */
const DOTNET_ESCAPE_SET = new Set([
  0x003c, // <
  0x003e, // >
  0x0026, // &
  0x002b, // +
  0x0027, // '
  0x0022, // "  — .NET default encoder uses " form
])

/** Escapes a string using System.Text.Json's default encoder rules. */
function dotnetEscapeString(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i)!
    // Surrogate pairs: advance i
    if (cp > 0xffff) i++

    if (cp === 0x5c) {
      // backslash
      out += '\\\\'
    } else if (cp === 0x0a) {
      out += '\\n'
    } else if (cp === 0x0d) {
      out += '\\r'
    } else if (cp === 0x09) {
      out += '\\t'
    } else if (cp < 0x20) {
      // other control chars
      out += `\\u${cp.toString(16).padStart(4, '0')}`
    } else if (DOTNET_ESCAPE_SET.has(cp) || cp > 0x7e) {
      // HTML-unsafe or non-ASCII
      if (cp <= 0xffff) {
        out += `\\u${cp.toString(16).padStart(4, '0')}`
      } else {
        // Encode as surrogate pair \uXXXX\uXXXX
        const hi = 0xd800 + ((cp - 0x10000) >> 10)
        const lo = 0xdc00 + ((cp - 0x10000) & 0x3ff)
        out += `\\u${hi.toString(16).padStart(4, '0')}\\u${lo.toString(16).padStart(4, '0')}`
      }
    } else {
      out += String.fromCodePoint(cp)
    }
  }
  return out
}

/** Wraps a string in quotes with .NET encoding. */
function encStr(s: string | null): string {
  if (s === null) return 'null'
  return `"${dotnetEscapeString(s)}"`
}

/** Renders a JSON value using .NET encoding rules. */
function encVal(value: unknown, indent: number): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return encStr(value)
  if (Array.isArray(value)) return encArr(value as unknown[], indent)
  if (typeof value === 'object') return encObj(value as Record<string, unknown>, indent)
  return 'null'
}

function pad(n: number): string {
  return '  '.repeat(n)
}

function encArr(arr: unknown[], indent: number): string {
  if (arr.length === 0) return '[]'
  const inner = arr.map((v) => `${pad(indent + 1)}${encVal(v, indent + 1)}`).join(',\n')
  return `[\n${inner}\n${pad(indent)}]`
}

function encObj(obj: Record<string, unknown>, indent: number): string {
  const keys = Object.keys(obj)
  if (keys.length === 0) return '{}'
  const inner = keys
    .map((k) => `${pad(indent + 1)}${encStr(k)}: ${encVal(obj[k], indent + 1)}`)
    .join(',\n')
  return `{\n${inner}\n${pad(indent)}}`
}

// ---------------------------------------------------------------------------
// LauncherConfig — property order matches C# declared order:
//   roots, defaultRoot, ignore, hidden, projects
// ---------------------------------------------------------------------------

/** Creates a default (empty) LauncherConfig, matching LauncherConfig.CreateDefault(). */
export function createDefaultConfig(): LauncherConfig {
  return {
    roots: [],
    defaultRoot: null,
    ignore: [],
    hidden: [],
    projects: {},
  }
}

/**
 * Parses a JSON string into LauncherConfig, applying normalization to backfill
 * missing properties (matching ConfigService.Normalize).
 */
export function parseConfig(json: string): LauncherConfig {
  let raw: Partial<LauncherConfig & { Projects?: Record<string, ProjectUsage> }> = {}
  try {
    raw = JSON.parse(json) as typeof raw
  } catch {
    // Invalid JSON → return defaults
    return createDefaultConfig()
  }

  // camelCase parse (System.Text.Json PropertyNameCaseInsensitive = true means
  // it accepts both cases — raw from file is already camelCase from PS launcher).
  const roots: string[] = normalizeStringArray(raw.roots ?? [])
  const defaultRoot: string | null = (raw.defaultRoot as string | null | undefined) ?? null
  const ignore: string[] = normalizeStringArray(raw.ignore ?? [])
  const hidden: string[] = normalizeStringArray(raw.hidden ?? [])
  const projectsRaw = (raw.projects ?? {}) as Record<string, unknown>
  const projects: Record<string, ProjectUsage> = {}
  for (const [k, v] of Object.entries(projectsRaw)) {
    if (v && typeof v === 'object') {
      const pu = v as Partial<ProjectUsage>
      projects[k] = {
        lastUsed: (pu.lastUsed as string | null | undefined) ?? null,
        flags: (pu.flags as string | null | undefined) ?? null,
      }
    }
  }

  return { roots, defaultRoot, ignore, hidden, projects }
}

function normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return (arr as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
}

/**
 * Serializes a LauncherConfig to a JSON string byte-identical to
 * System.Text.Json with WriteIndented=true, CamelCase, and default encoder.
 * Property order: roots, defaultRoot, ignore, hidden, projects.
 * No trailing newline.
 */
export function serializeConfig(config: LauncherConfig): string {
  const projectsObj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config.projects ?? {})) {
    // ProjectUsage declared order: lastUsed, flags
    projectsObj[k] = { lastUsed: v.lastUsed, flags: v.flags }
  }

  // Build ordered object matching C# property declaration order
  const obj: Record<string, unknown> = {
    roots: config.roots,
    defaultRoot: config.defaultRoot,
    ignore: config.ignore,
    hidden: config.hidden,
    projects: projectsObj,
  }

  return encObj(obj, 0)
}

// ---------------------------------------------------------------------------
// AppState — property order matches C# declared order:
//   theme, sortMode, pinned, onboardingDismissed, accent, font,
//   recentLaunches, profiles, groups, savedFilters, closeToTray
// ---------------------------------------------------------------------------

const APP_STATE_DEFAULTS: AppState = {
  theme: 'System',
  sortMode: 'LastUsed',
  pinned: [],
  onboardingDismissed: false,
  accent: 'Default',
  font: 'Segoe UI Variable',
  recentLaunches: [],
  profiles: [],
  groups: [],
  savedFilters: [],
  closeToTray: false,
  terminalId: '',
  // Sessions start in auto permission mode unless the project's own flags or an
  // applied profile say otherwise. Set to '' in Settings to hand the decision
  // back to the CLI's own default.
  defaultPermissionMode: 'auto',
}

/**
 * Parses state.json into AppState, backfilling missing fields with defaults.
 * A corrupt file returns full defaults.
 */
export function parseState(json: string): AppState {
  let raw: Partial<AppState> = {}
  try {
    raw = JSON.parse(json) as Partial<AppState>
  } catch {
    return { ...APP_STATE_DEFAULTS }
  }

  const profiles: LaunchProfile[] = Array.isArray(raw.profiles)
    ? (raw.profiles as LaunchProfile[]).map(normalizeProfile)
    : []

  const groups: LaunchGroup[] = Array.isArray(raw.groups)
    ? (raw.groups as LaunchGroup[]).map(normalizeGroup)
    : []

  const savedFilters: SavedFilter[] = Array.isArray(raw.savedFilters)
    ? (raw.savedFilters as SavedFilter[]).map(normalizeSavedFilter)
    : []

  return {
    theme: (raw.theme as string | undefined) ?? APP_STATE_DEFAULTS.theme,
    sortMode: (raw.sortMode as string | undefined) ?? APP_STATE_DEFAULTS.sortMode,
    pinned: Array.isArray(raw.pinned) ? (raw.pinned as string[]) : [],
    onboardingDismissed: (raw.onboardingDismissed as boolean | undefined) ?? false,
    accent: (raw.accent as string | undefined) ?? APP_STATE_DEFAULTS.accent,
    font: (raw.font as string | undefined) ?? APP_STATE_DEFAULTS.font,
    recentLaunches: Array.isArray(raw.recentLaunches) ? (raw.recentLaunches as string[]) : [],
    profiles,
    groups,
    savedFilters,
    closeToTray: (raw.closeToTray as boolean | undefined) ?? false,
    terminalId: (raw.terminalId as string | undefined) ?? '',
    // ?? not ||, so an explicit '' (user chose "leave it to the CLI") survives a
    // round-trip instead of snapping back to 'auto'.
    defaultPermissionMode: (raw.defaultPermissionMode as string | undefined) ?? 'auto',
  }
}

function normalizeProfile(p: Partial<LaunchProfile>): LaunchProfile {
  return {
    name: (p.name as string | undefined) ?? '',
    model: (p.model as string | null | undefined) ?? null,
    permissionMode: (p.permissionMode as string | null | undefined) ?? null,
    allowedTools: Array.isArray(p.allowedTools) ? (p.allowedTools as string[]) : [],
    disallowedTools: Array.isArray(p.disallowedTools) ? (p.disallowedTools as string[]) : [],
  }
}

function normalizeGroup(g: Partial<LaunchGroup>): LaunchGroup {
  return {
    name: (g.name as string | undefined) ?? '',
    projectPaths: Array.isArray(g.projectPaths) ? (g.projectPaths as string[]) : [],
  }
}

function normalizeSavedFilter(f: Partial<SavedFilter>): SavedFilter {
  return {
    name: (f.name as string | undefined) ?? '',
    pathContains: (f.pathContains as string | null | undefined) ?? null,
    requireGit: (f.requireGit as boolean | undefined) ?? false,
    requireClaudeMd: (f.requireClaudeMd as boolean | undefined) ?? false,
    requireRunning: (f.requireRunning as boolean | undefined) ?? false,
    requirePinned: (f.requirePinned as boolean | undefined) ?? false,
  }
}

/**
 * Serializes AppState to a JSON string byte-identical to System.Text.Json
 * with WriteIndented=true, CamelCase, and default encoder.
 * Property order matches C# AppState declared order.
 */
export function serializeState(state: AppState): string {
  const obj: Record<string, unknown> = {
    theme: state.theme,
    sortMode: state.sortMode,
    pinned: state.pinned,
    onboardingDismissed: state.onboardingDismissed,
    accent: state.accent,
    font: state.font,
    recentLaunches: state.recentLaunches,
    profiles: state.profiles.map((p) => ({
      // LaunchProfile declared order: name, model, permissionMode, allowedTools, disallowedTools
      name: p.name,
      model: p.model,
      permissionMode: p.permissionMode,
      allowedTools: p.allowedTools,
      disallowedTools: p.disallowedTools,
    })),
    groups: state.groups.map((g) => ({
      // LaunchGroup declared order: name, projectPaths
      name: g.name,
      projectPaths: g.projectPaths,
    })),
    savedFilters: state.savedFilters.map((f) => ({
      // SavedFilter declared order: name, pathContains, requireGit, requireClaudeMd, requireRunning, requirePinned
      name: f.name,
      pathContains: f.pathContains,
      requireGit: f.requireGit,
      requireClaudeMd: f.requireClaudeMd,
      requireRunning: f.requireRunning,
      requirePinned: f.requirePinned,
    })),
    closeToTray: state.closeToTray,
    terminalId: state.terminalId ?? '',
    defaultPermissionMode: state.defaultPermissionMode ?? 'auto',
  }

  return encObj(obj, 0)
}
