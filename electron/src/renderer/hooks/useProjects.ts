import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProjectInfo } from '../../core/models'

export interface UseProjectsResult {
  projects: ProjectInfo[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Mirrors MainViewModel's load sequence:
 * 1. config:read → get roots
 * 2. projects:scan per root → merge arrays
 * Subscribes to event:fileChanged to invalidate on folder changes (mirrors
 * MainViewModel's FileSystemWatcher → debounce → Rescan() path).
 */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanKey, setScanKey] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function scan(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const config = await window.ccmc.invoke('config:read')
        const roots = config.roots ?? []

        if (roots.length === 0) {
          if (!cancelled && mountedRef.current) {
            setProjects([])
            setLoading(false)
          }
          return
        }

        const results = await Promise.all(
          roots.map((root) => window.ccmc.invoke('projects:scan', { root })),
        )

        if (!cancelled && mountedRef.current) {
          setProjects(results.flat())
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    }

    void scan()
    return () => {
      cancelled = true
    }
  }, [scanKey])

  // Subscribe to file-change events — mirrors watcher debounce → Rescan()
  useEffect(() => {
    const unsub = window.ccmc.on('event:fileChanged', () => {
      setScanKey((k) => k + 1)
    })
    return unsub
  }, [])

  const refresh = useCallback(() => {
    setScanKey((k) => k + 1)
  }, [])

  return { projects, loading, error, refresh }
}
