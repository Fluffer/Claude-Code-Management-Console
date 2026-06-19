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

function detectOsTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeProviderProps {
  children: React.ReactNode
  /** Force a specific theme; undefined means follow OS. */
  defaultTheme?: AppTheme
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<AppTheme>(defaultTheme ?? detectOsTheme)

  // Apply data-theme attribute whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
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
