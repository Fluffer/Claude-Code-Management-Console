/**
 * ThemeProvider and useTheme hook.
 *
 * Follows OS color scheme by default via matchMedia('(prefers-color-scheme: dark)').
 * HighContrast can be selected manually via setTheme('high-contrast').
 *
 * TODO: wire nativeTheme push from main process via window.ccmc.on('theme:changed', …)
 * once that IPC event is added to IpcEvents. For now, matchMedia covers auto-switching.
 *
 * Sets data-theme on document.documentElement so themes.css vars take effect.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type AppTheme = 'light' | 'dark' | 'high-contrast'

interface ThemeContextValue {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'ccmc-theme'

function detectOsTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark' || value === 'high-contrast'
}

/**
 * Maps a persisted AppState.theme string ("Dark" / "Light" / "HighContrast" /
 * "System") to an AppTheme. "System" (or anything unknown) follows the OS.
 * Used to apply the saved theme at startup so the app doesn't launch in the OS
 * theme and ignore the user's choice.
 */
export function appThemeFromStateString(stateTheme: string): AppTheme {
  if (stateTheme === 'Dark') return 'dark'
  if (stateTheme === 'Light') return 'light'
  if (stateTheme === 'HighContrast' || stateTheme === 'High Contrast') return 'high-contrast'
  return detectOsTheme()
}

/**
 * Initial theme for first paint. Reads the last theme synchronously from
 * localStorage to avoid a flash of the wrong theme before the persisted
 * AppState loads over async IPC; falls back to the OS preference.
 */
function getInitialTheme(defaultTheme?: AppTheme): AppTheme {
  if (defaultTheme) return defaultTheme
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isAppTheme(stored)) return stored
  } catch {
    // localStorage unavailable — fall through to OS detection.
  }
  return detectOsTheme()
}

/**
 * Sets data-theme on <html> from the last-known theme BEFORE React renders, so
 * the very first paint uses the correct theme (the ThemeProvider effect that
 * sets data-theme only runs after the first paint, which would otherwise flash).
 * Call once from the renderer entry point.
 */
export function applyStoredThemeAttribute(): void {
  document.documentElement.setAttribute('data-theme', getInitialTheme())
}

interface ThemeProviderProps {
  children: React.ReactNode
  /** Force a specific theme; undefined means follow OS. */
  defaultTheme?: AppTheme
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<AppTheme>(() => getInitialTheme(defaultTheme))

  // Apply data-theme attribute whenever theme changes, and remember it so the
  // next launch can paint the correct theme immediately (no flash).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore — persistence is best-effort
    }
  }, [theme])

  // Listen for OS theme changes (only when not manually overridden)
  useEffect(() => {
    if (defaultTheme) return // manual override — don't follow OS

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => {
      // Only auto-switch between light/dark, not away from high-contrast
      setThemeState((prev) => {
        if (prev === 'high-contrast') return prev
        return e.matches ? 'dark' : 'light'
      })
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [defaultTheme])

  const setTheme = useCallback((t: AppTheme) => {
    setThemeState(t)
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
