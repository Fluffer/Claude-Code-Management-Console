import { useState, useEffect, useCallback } from 'react'
import type { AppState } from '../../core/models'

export interface UseAppStateResult {
  state: AppState | null
  loading: boolean
  setSortMode: (mode: string) => void
  togglePin: (path: string) => void
  setOnboardingDismissed: () => void
  writeState: (next: AppState) => void
}

/**
 * Reads AppState via IPC; provides typed mutation helpers that write back.
 * Mirrors MainViewModel's _state management:
 *   - OnSortModeChanged → setSortMode (persists immediately)
 *   - TogglePin → togglePin (persists immediately, re-applies filter in App)
 *   - DismissOnboarding → setOnboardingDismissed
 * Case-insensitive path comparison for pin ops mirrors C# StringComparer.OrdinalIgnoreCase.
 */
export function useAppState(): UseAppStateResult {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const s = await window.ccmc.invoke('state:read')
        if (!cancelled) {
          setState(s)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const writeState = useCallback((next: AppState) => {
    setState(next)
    void window.ccmc.invoke('state:write', next)
  }, [])

  const setSortMode = useCallback((mode: string) => {
    setState((prev) => {
      if (!prev) return prev
      const next = { ...prev, sortMode: mode }
      void window.ccmc.invoke('state:write', next)
      return next
    })
  }, [])

  const togglePin = useCallback((path: string) => {
    setState((prev) => {
      if (!prev) return prev
      const lower = path.toLowerCase()
      const pinned = prev.pinned.some((p) => p.toLowerCase() === lower)
        ? prev.pinned.filter((p) => p.toLowerCase() !== lower)
        : [...prev.pinned, path]
      const next = { ...prev, pinned }
      void window.ccmc.invoke('state:write', next)
      return next
    })
  }, [])

  const setOnboardingDismissed = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev
      const next = { ...prev, onboardingDismissed: true }
      void window.ccmc.invoke('state:write', next)
      return next
    })
  }, [])

  return { state, loading, setSortMode, togglePin, setOnboardingDismissed, writeState }
}
