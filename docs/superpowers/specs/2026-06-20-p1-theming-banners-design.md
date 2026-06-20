# Design — P1 theming (accent + font) + onboarding / Claude-missing banners

**Date:** 2026-06-20 · **Branch:** `feat/electron-rewrite`
Closes parity gaps P1 #8–#11. Accent/font are already stored in `AppState` (`accent`, `font`)
but never rendered or applied; onboarding state + `setOnboardingDismissed` exist with no UI; the
Claude-missing warning has no Electron equivalent. WinUI reference: `Views/SettingsDialog.xaml`
(AccentCombo/FontCombo), `MainWindow.xaml` rows 0–1 (the two InfoBars), `MainViewModel`
(`ClaudeMissing = !claudeCli.IsOnPath`, `ShowOnboarding = !state.OnboardingDismissed`).

## #8 Accent — curated set, shades derived via `color-mix`

- `electron/src/core/theme/accents.ts` (pure, unit-tested):
  ```ts
  export interface AccentOption { id: string; name: string; hex: string }
  export const ACCENTS: AccentOption[]   // Default #0078d4, Purple, Teal, Green, Orange, Red, Pink
  export function resolveAccentHex(id: string): string  // unknown/'' → Default hex
  ```
- `electron/src/renderer/theme/themes.css`: refactor the accent ramp so every shade derives from a
  single `--accent` (default stays `#0078d4`, so the default look is unchanged):
  ```
  --accent-fill:            var(--accent);
  --accent-fill-secondary:  color-mix(in srgb, var(--accent) 90%, black);
  --accent-fill-tertiary:   color-mix(in srgb, var(--accent) 80%, black);
  --accent-light1/2/3:      color-mix(in srgb, var(--accent) 90%/80%/70%, white);
  --accent-dark1/2/3:       color-mix(in srgb, var(--accent) 90%/80%/70%, black);
  ```
  Apply in every theme block that currently hardcodes these (light / dark / high-contrast). Chromium
  (Electron) supports `color-mix`. `--text-on-accent` stays as-is.
- `electron/src/renderer/theme/applyAppearance.ts` (unit-tested via jsdom):
  `applyAccent(id: string): void` → `document.documentElement.style.setProperty('--accent', resolveAccentHex(id))`.

## #9 Font — curated UI-font list

- `electron/src/core/theme/fonts.ts` (pure, unit-tested):
  ```ts
  export interface FontOption { id: string; name: string; stack: string }
  export const FONTS: FontOption[]   // Default (Segoe UI Variable…), Segoe UI, system-ui, Verdana, Arial, Consolas, Cascadia Code
  export function resolveFontStack(id: string): string  // unknown/'' → Default stack
  ```
  Default stack = the current `'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif`.
- `themes.css`: add `--app-font` (default = the stack above); the `font-family` declarations that
  currently hardcode the Segoe stack use `var(--app-font)` instead.
- `applyAppearance.ts`: `applyFont(id)` → set `--app-font` to `resolveFontStack(id)`.

## SettingsDialog + state wiring

- `SettingsDialog.tsx`: add an **Accent** `<select>` (ACCENTS) and a **Font** `<select>` (FONTS) in the
  Appearance section next to Theme. Initialise from `state.accent`/`state.font`. On change: call
  `applyAccent`/`applyFont` immediately (live preview, mirroring how Theme applies live) and hold the
  value in local state; persist into `state.accent`/`state.font` on Save (extend the existing
  `nextState` object — no new IPC).
- Apply-on-load: a small effect in `MainWindow` (App.tsx) calls `applyAccent(state.accent)` +
  `applyFont(state.font)` whenever `state` loads/changes, so a saved accent/font is active at startup
  and after any save. (Cancel in Settings without Save must revert to the persisted value — the
  load effect re-applies `state.*`; Settings’ live preview is reverted on close by re-running it.)
  Decision: on Settings **Cancel**, re-apply from the last persisted `state` so an un-saved preview
  doesn’t stick.

## #10 Onboarding banner

- `electron/src/renderer/components/ui/Banner.tsx`: a reusable InfoBar-style strip.
  Props: `severity: 'info' | 'warning'`, `title?`, `message`, `actionLabel?`, `onAction?`,
  `onClose?` (close button only when provided). Tailwind theme vars; `role="status"` (info) /
  `role="alert"` (warning).
- App.tsx: render above the search row when `!state.onboardingDismissed`. Ported text — title
  “Welcome to Claude Code Management Console!”, the WinUI message about Enter/Ctrl+Enter/Ctrl+F/
  star/F1; `actionLabel="Open guide"` → open the help dialog; `onClose` → `setOnboardingDismissed()`.

## #11 Claude-missing banner

- IPC: add `claude:onPath` → `{ onPath: boolean }`. Handler: `commandLocator.findOnPath('claude') !== null`.
- `electron/src/renderer/hooks/useClaudeOnPath.ts`: invoke on mount; re-check when the project list
  refreshes (subscribe `event:fileChanged`, same pattern as the other hooks). Returns `{ onPath }`
  (default `true` until the first result resolves, so the banner never flashes on a healthy machine).
- App.tsx: render a **non-closable** warning Banner above the search row (below onboarding) when
  `onPath === false`. Ported message: “'claude' was not found on PATH. Sessions will open a terminal,
  but the claude command will fail. Install Claude Code or fix PATH, then press Refresh (F5).”

Both banners sit in a stack at the top of the main content area (matching WinUI Grid rows 0/1):
Claude-missing first (warning), onboarding second (info) — or the WinUI order (warning row 0,
onboarding row 1). Use the WinUI order.

## Testing / verification

- Unit-tested: `accents.ts`, `fonts.ts` (resolvers incl. unknown→default), `applyAppearance.ts`
  (jsdom asserts the CSS vars get set), `Banner.tsx` (renders message, action fires, close only when
  provided), the `claude:onPath` handler (mock `commandLocator.findOnPath`), and `useClaudeOnPath`.
  SettingsDialog gets a focused test for accent/font select → persisted in `state`.
- Gates: `npm run build`, `npm run lint`, `npx vitest run` green.
- Council (Ollama, cap 3) reviews the `themes.css` color-mix refactor + the apply/revert flow.
- Live: launch, switch accent/font in Settings (live preview + persists), see the onboarding banner
  on a fresh state and the Claude-missing banner when `claude` isn’t on PATH. GUI confirmation is the
  user’s (the project discipline).

## Non-goals (YAGNI)

System-accent follow (WinUI “Default follows Windows accent”) → Default is just the fixed blue;
per-monospace-font control; font enumeration; banner animations; persisting which banner was seen
beyond the existing `onboardingDismissed`.
