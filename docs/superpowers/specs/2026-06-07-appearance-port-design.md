# Appearance Port: Palettes, Accents, Fonts (from WSL Command Center)

**Date:** 2026-06-07
**Status:** Approved

## Goal

Port WSL Command Center's appearance system into Dev-Projects (WinUI 3): 6 developer
palettes (Dracula, Nord, Catppuccin, Tokyo Night, One Dark, Gruvbox), 8 accent colors,
and a 7-font picker. All appearance controls live in the Settings dialog; the sidebar
theme ComboBox is removed.

Source of truth for ported code: `C:\Dev\Active\WSL Command Center` —
`Wsl.App\Theming\Palettes.cs`, `Wsl.App\Theming\Accents.cs`, `Wsl.App\Theming\Appearance.cs`,
`Wsl.App\MainWindow.xaml.cs` (`ApplyAppearance`), `Wsl.App\Views\SettingsPage.xaml(.cs)`.

## Decisions

- **Scope:** full port (palettes + accents + fonts).
- **UI placement:** SettingsDialog. Sidebar theme ComboBox removed.
- **Persistence:** extend existing `AppState`/`state.json` (no new settings file).

## Design

### Models (DevProjects.Core)

`AppState` gains:
- `Accent` (string, default `"Default"`)
- `Font` (string, default `"Segoe UI Variable"`)

`Theme` keeps existing System/Light/Dark values and additionally accepts palette names
(Dracula, Nord, Catppuccin, Tokyo Night, One Dark, Gruvbox). `StateService` unchanged —
JSON round-trips the new fields.

### Theming layer (new `src/DevProjects.WinUI/Theming/`)

- `Palettes.cs` — palette record (name, background color, accent color) + the 6 palettes,
  ported from WSL CC.
- `Accents.cs` — 8 accent presets (Default/Blue/Teal/Green/Orange/Purple/Red/Pink) +
  `AppFonts.All` (Segoe UI Variable, Segoe UI, Anthropic Sans, Cascadia Mono,
  Cascadia Code, Consolas, Lucida Console), ported from WSL CC.
- `Appearance.cs` — `OverrideResources(theme, accent, font)`: writes accent color/brush
  overrides (SystemAccentColor + variants, AccentFillColor* brushes,
  NavigationViewSelectionIndicatorForeground, AccentButtonBackground states) and
  `ContentControlThemeFontFamily` into `Application.Current.Resources`. Ported from
  WSL CC, adapted to this app (no NavigationView → keep override harmless or drop it).

### Startup (App.xaml.cs)

Load `AppState` via `StateService` in `OnLaunched` *before* constructing `MainWindow`;
call `Appearance.OverrideResources(...)` so the first paint already has accent + font.

### MainWindow

`ApplyTheme(string)` becomes `ApplyAppearance(...)`:
- System/Light/Dark → Mica backdrop + matching `ElementTheme`.
- Palette name → solid-color backdrop (palette background), `ElementTheme.Dark`,
  palette accent applied via `Appearance.OverrideResources`.
- Root `FontFamily` set from state so non-styled text picks up the font.
- Live switch: re-apply resources and force `{ThemeResource}` refresh (toggle
  `RequestedTheme` trick as in WSL CC).
- Dialogs continue to receive `RequestedTheme` from `RootGrid` (existing pattern).

### MainViewModel

- `Themes` list extended with the 6 palette names.
- New observable `Accent` + `Font` properties; `OnAccentChanged`/`OnFontChanged` persist
  to state.json and raise an appearance-change event (reuse/extend
  `ThemeChangeRequested` → a single `AppearanceChangeRequested` is acceptable).

### SettingsDialog

Three labelled ComboBoxes above the existing source-roots section (or below — match
dialog flow): Theme (System/Light/Dark + 6 palettes), Accent (8), Font (7). Changes
apply live and persist immediately. Sidebar ComboBox and its grid row removed from
MainWindow.xaml.

### Error handling

Unknown theme/accent/font names in state.json fall back to defaults (matches existing
corruption-tolerant pattern). Missing fields in old state.json deserialize to defaults.

### Testing

- Core: round-trip tests for new `AppState` fields; defaulting behavior for old
  state.json without the fields.
- UI: build + manual smoke (palette switch live, accent applies to buttons/badges,
  font applies, persistence across restart).
