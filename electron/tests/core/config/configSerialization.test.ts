import { describe, it, expect } from 'vitest'
import { parseConfig, serializeConfig, parseState, serializeState, createDefaultConfig } from '../../../src/core/config/configSerialization'
import type { AppState } from '../../../src/core/models'

// ---------------------------------------------------------------------------
// LauncherConfig parse / serialize
// ---------------------------------------------------------------------------

describe('ConfigSerialization - LauncherConfig', () => {
  it('Load_CreatesDefaults_IsEmpty', () => {
    const config = createDefaultConfig()
    expect(config.roots).toEqual([])
    expect(config.defaultRoot).toBeNull()
    expect(config.projects).toEqual({})
  })

  it('Load_RoundTripsSavedConfig', () => {
    const config = createDefaultConfig()
    config.roots = ['C:\\Somewhere']
    config.defaultRoot = 'C:\\Somewhere'
    config.projects!['C:\\Somewhere\\Proj'] = {
      lastUsed: '2026-06-01T10:00:00.0000000Z',
      flags: '--model opus',
    }

    const json = serializeConfig(config)
    const reloaded = parseConfig(json)

    expect(reloaded.roots).toEqual(['C:\\Somewhere'])
    expect(reloaded.projects!['C:\\Somewhere\\Proj'].flags).toBe('--model opus')
    expect(reloaded.projects!['C:\\Somewhere\\Proj'].lastUsed).toBe('2026-06-01T10:00:00.0000000Z')
  })

  it('Load_ReadsLegacyPowerShellConfig', () => {
    const json = `{
  "roots": ["C:\\\\Dev\\\\Active"],
  "defaultRoot": "C:\\\\Dev\\\\Active",
  "ignore": ["notes"],
  "projects": {
    "C:\\\\Dev\\\\Active\\\\Hotel-Search": { "lastUsed": "2026-06-06T14:30:00Z", "flags": "--model opus" },
    "C:\\\\Dev\\\\Active\\\\Other": { "lastUsed": null, "flags": "" }
  }
}`
    const config = parseConfig(json)

    expect(config.roots).toEqual(['C:\\Dev\\Active'])
    expect(config.ignore).toEqual(['notes'])
    expect(config.projects!['C:\\Dev\\Active\\Hotel-Search'].flags).toBe('--model opus')
    expect(config.projects!['C:\\Dev\\Active\\Other'].lastUsed).toBeNull()
  })

  it('Load_BackfillsMissingProperties', () => {
    const config = parseConfig('{}')
    expect(config.roots).not.toBeNull()
    expect(config.ignore).not.toBeNull()
    expect(config.projects).not.toBeNull()
  })

  it('Load_NormalizesHiddenList_DroppingBlankEntries', () => {
    const json = '{"roots":[],"hidden":["C:\\\\Dev\\\\X",""," "]}'
    const config = parseConfig(json)
    expect(config.hidden).toEqual(['C:\\Dev\\X'])
  })

  it('Load_BackfillsHidden_WhenMissingFromOlderConfig', () => {
    const config = parseConfig('{"roots":[]}')
    expect(config.hidden).not.toBeNull()
    expect(config.hidden).toEqual([])
  })

  it('CreateDefault_IsEmpty_NoPersonalPaths', () => {
    const config = createDefaultConfig()
    expect(config.roots).toEqual([])
    expect(config.defaultRoot).toBeNull()
    expect(config.ignore).toEqual([])
    expect(config.projects).toEqual({})
  })

  it('Serialize_ProducesIndentedJson', () => {
    const config = createDefaultConfig()
    const json = serializeConfig(config)
    expect(json).toContain('\n')
    expect(json).toMatch(/^{/)
    // 2-space indentation
    expect(json).toContain('  "roots"')
  })

  it('RoundTrip_CamelCaseKeys', () => {
    const config = createDefaultConfig()
    config.defaultRoot = 'C:\\Dev'
    const json = serializeConfig(config)
    expect(json).toContain('"defaultRoot"')
    expect(json).not.toContain('"DefaultRoot"')
  })

  it('Serialize_NullWritten_NotOmitted', () => {
    const config = createDefaultConfig()
    // defaultRoot is null in default; it must still appear
    const json = serializeConfig(config)
    expect(json).toContain('"defaultRoot"')
  })

  it('RoundTrip_ProjectsNullLastUsed', () => {
    const config = createDefaultConfig()
    config.projects!['C:\\Dev\\Proj'] = { lastUsed: null, flags: '' }
    const json = serializeConfig(config)
    const reloaded = parseConfig(json)
    expect(reloaded.projects!['C:\\Dev\\Proj'].lastUsed).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// BYTE-PARITY tests — System.Text.Json default encoder escapes <>&+'" and non-ASCII
// ---------------------------------------------------------------------------

describe('ConfigSerialization - ByteParity', () => {
  it('Serialize_EscapesAngleBrackets', () => {
    const config = createDefaultConfig()
    config.roots = ['<script>']
    const json = serializeConfig(config)
    expect(json).toContain('\\u003cscript\\u003e')
    expect(json).not.toContain('<script>')
  })

  it('Serialize_EscapesAmpersand', () => {
    const config = createDefaultConfig()
    config.roots = ['Foo & Bar']
    const json = serializeConfig(config)
    expect(json).toContain('Foo \\u0026 Bar')
  })

  it('Serialize_EscapesPlus', () => {
    const config = createDefaultConfig()
    config.roots = ['a+b']
    const json = serializeConfig(config)
    expect(json).toContain('a\\u002bb')
  })

  it('Serialize_EscapesApostrophe', () => {
    const config = createDefaultConfig()
    config.roots = ["it's"]
    const json = serializeConfig(config)
    expect(json).toContain("it\\u0027s")
  })

  it('Serialize_EscapesNonAscii', () => {
    const config = createDefaultConfig()
    config.roots = ['café']
    const json = serializeConfig(config)
    expect(json).toContain('caf\\u00e9')
  })

  it('Serialize_BackslashesPreserved_AsDoubleBackslash', () => {
    // Backslash is a standard JSON escape, not .NET-specific
    const config = createDefaultConfig()
    config.roots = ['C:\\Dev\\Active']
    const json = serializeConfig(config)
    expect(json).toContain('C:\\\\Dev\\\\Active')
  })

  it('RoundTrip_TrickyChars_ParseBack', () => {
    const config = createDefaultConfig()
    config.roots = ['<foo>&\'bar\'+café']
    const json = serializeConfig(config)
    const reloaded = parseConfig(json)
    expect(reloaded.roots).toEqual(['<foo>&\'bar\'+café'])
  })

  it('Serialize_NoTrailingNewline', () => {
    const config = createDefaultConfig()
    const json = serializeConfig(config)
    expect(json.endsWith('\n')).toBe(false)
    expect(json.endsWith('}')).toBe(true)
  })

  it('Serialize_PropertyOrder_LauncherConfig', () => {
    // C# declared order: roots, defaultRoot, ignore, hidden, projects
    const config = createDefaultConfig()
    const json = serializeConfig(config)
    const rootsIdx = json.indexOf('"roots"')
    const defaultRootIdx = json.indexOf('"defaultRoot"')
    const ignoreIdx = json.indexOf('"ignore"')
    const hiddenIdx = json.indexOf('"hidden"')
    const projectsIdx = json.indexOf('"projects"')

    expect(rootsIdx).toBeLessThan(defaultRootIdx)
    expect(defaultRootIdx).toBeLessThan(ignoreIdx)
    expect(ignoreIdx).toBeLessThan(hiddenIdx)
    expect(hiddenIdx).toBeLessThan(projectsIdx)
  })

  it('Serialize_PropertyOrder_ProjectUsage', () => {
    // C# declared order: lastUsed, flags
    const config = createDefaultConfig()
    config.projects!['C:\\Proj'] = { lastUsed: '2026-01-01T00:00:00.0000000Z', flags: '--x' }
    const json = serializeConfig(config)
    const lastUsedIdx = json.indexOf('"lastUsed"')
    const flagsIdx = json.indexOf('"flags"')
    expect(lastUsedIdx).toBeLessThan(flagsIdx)
  })
})

// ---------------------------------------------------------------------------
// AppState parse / serialize
// ---------------------------------------------------------------------------

describe('ConfigSerialization - AppState', () => {
  it('Load_ReturnsDefaults_WhenMissingOrCorrupt', () => {
    const state = parseState('{}')
    expect(state.theme).toBe('System')
    expect(state.accent).toBe('Default')
    expect(state.font).toBe('Segoe UI Variable')
  })

  it('SaveAndLoad_RoundTrips', () => {
    const input: AppState = {
      theme: 'Dark',
      sortMode: 'Name',
      pinned: ['C:\\Dev\\Active\\Foo'],
      onboardingDismissed: true,
      accent: 'Default',
      font: 'Segoe UI Variable',
      recentLaunches: [],
      profiles: [],
      groups: [],
      savedFilters: [],
      closeToTray: false,
      terminalId: '',
    }
    const json = serializeState(input)
    const state = parseState(json)

    expect(state.theme).toBe('Dark')
    expect(state.sortMode).toBe('Name')
    expect(state.pinned).toEqual(['C:\\Dev\\Active\\Foo'])
    expect(state.onboardingDismissed).toBe(true)
  })

  it('Defaults_IncludeAccentAndFont', () => {
    const state = parseState('{}')
    expect(state.accent).toBe('Default')
    expect(state.font).toBe('Segoe UI Variable')
  })

  it('RoundTrip_PreservesAccentAndFont', () => {
    const input: AppState = {
      theme: 'Dracula',
      sortMode: 'LastUsed',
      pinned: [],
      onboardingDismissed: false,
      accent: 'Teal',
      font: 'Cascadia Code',
      recentLaunches: [],
      profiles: [],
      groups: [],
      savedFilters: [],
      closeToTray: false,
      terminalId: '',
    }
    const json = serializeState(input)
    const state = parseState(json)

    expect(state.theme).toBe('Dracula')
    expect(state.accent).toBe('Teal')
    expect(state.font).toBe('Cascadia Code')
  })

  it('OldStateJson_WithoutNewFields_LoadsDefaults', () => {
    const json = '{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true}'
    const state = parseState(json)

    expect(state.theme).toBe('Dark')
    expect(state.accent).toBe('Default')
    expect(state.font).toBe('Segoe UI Variable')
  })

  it('Defaults_IncludeEmptyRecentLaunches', () => {
    const state = parseState('{}')
    expect(state.recentLaunches).toEqual([])
  })

  it('OldStateJson_WithoutRecentLaunches_LoadsEmptyList', () => {
    const json = '{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true}'
    expect(parseState(json).recentLaunches).toEqual([])
  })

  it('Defaults_IncludeEmptyProfiles', () => {
    expect(parseState('{}').profiles).toEqual([])
  })

  it('OldStateJson_WithoutProfiles_LoadsEmptyList', () => {
    const json = '{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true,"recentLaunches":[]}'
    expect(parseState(json).profiles).toEqual([])
  })

  it('Profiles_RoundTripThroughSaveLoad', () => {
    const input: AppState = {
      theme: 'System',
      sortMode: 'LastUsed',
      pinned: [],
      onboardingDismissed: false,
      accent: 'Default',
      font: 'Segoe UI Variable',
      recentLaunches: [],
      profiles: [{ name: 'Opus', model: 'opus', permissionMode: null, allowedTools: ['Read'], disallowedTools: [] }],
      groups: [],
      savedFilters: [],
      closeToTray: false,
      terminalId: '',
    }
    const json = serializeState(input)
    const reloaded = parseState(json)

    expect(reloaded.profiles).toHaveLength(1)
    expect(reloaded.profiles[0].name).toBe('Opus')
    expect(reloaded.profiles[0].model).toBe('opus')
    expect(reloaded.profiles[0].allowedTools).toEqual(['Read'])
  })

  it('Defaults_IncludeEmptyGroups', () => {
    expect(parseState('{}').groups).toEqual([])
  })

  it('OldStateJson_WithoutGroups_LoadsEmptyList', () => {
    const json = '{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true,"recentLaunches":[],"profiles":[]}'
    expect(parseState(json).groups).toEqual([])
  })

  it('Groups_RoundTrip', () => {
    const input: AppState = {
      theme: 'System',
      sortMode: 'LastUsed',
      pinned: [],
      onboardingDismissed: false,
      accent: 'Default',
      font: 'Segoe UI Variable',
      recentLaunches: [],
      profiles: [],
      groups: [{ name: 'Stack', projectPaths: ['C:\\a', 'C:\\b'] }],
      savedFilters: [],
      closeToTray: false,
      terminalId: '',
    }
    const json = serializeState(input)
    const reloaded = parseState(json)

    expect(reloaded.groups).toHaveLength(1)
    expect(reloaded.groups[0].name).toBe('Stack')
    expect(reloaded.groups[0].projectPaths).toEqual(['C:\\a', 'C:\\b'])
  })

  it('Defaults_IncludeEmptySavedFilters', () => {
    expect(parseState('{}').savedFilters).toEqual([])
  })

  it('OldStateJson_WithoutSavedFilters_LoadsEmptyList', () => {
    const json = '{"theme":"Dark","sortMode":"Name","pinned":[],"onboardingDismissed":true,"recentLaunches":[]}'
    expect(parseState(json).savedFilters).toEqual([])
  })

  it('SavedFilters_RoundTrip', () => {
    const input: AppState = {
      theme: 'System',
      sortMode: 'LastUsed',
      pinned: [],
      onboardingDismissed: false,
      accent: 'Default',
      font: 'Segoe UI Variable',
      recentLaunches: [],
      profiles: [],
      groups: [],
      savedFilters: [{ name: 'Active git', pathContains: 'Active', requireGit: true, requireClaudeMd: false, requireRunning: false, requirePinned: false }],
      closeToTray: false,
      terminalId: '',
    }
    const json = serializeState(input)
    const reloaded = parseState(json)

    expect(reloaded.savedFilters).toHaveLength(1)
    expect(reloaded.savedFilters[0].name).toBe('Active git')
    expect(reloaded.savedFilters[0].requireGit).toBe(true)
  })
})
