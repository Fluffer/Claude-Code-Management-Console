import { useState, useEffect, useRef } from 'react'
import type { RunningSession } from '../../core/models'

export interface UseRunningSessionsResult {
  sessions: RunningSession[]
  loading: boolean
}

const REFRESH_INTERVAL_MS = 30_000

/**
 * Polls sessions:listRunning every 30 seconds.
 * Also invalidates on event:fileChanged (same trigger as file-system watchers in WinUI).
 * Mirrors MainViewModel's _runningRefreshTimer (30s IsRepeating) + watcher debounce path.
 */
export function useRunningSessions(): UseRunningSessionsResult {
  const [sessions, setSessions] = useState<RunningSession[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const result = await window.ccmc.invoke('sessions:listRunning')
        if (!cancelled && mountedRef.current) {
          setSessions(result)
          setLoading(false)
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // 30-second periodic refresh — mirrors _runningRefreshTimer
  useEffect(() => {
    const id = setInterval(() => {
      setRefreshKey((k) => k + 1)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  // Invalidate on file-system change events
  useEffect(() => {
    const unsub = window.ccmc.on('event:fileChanged', () => {
      setRefreshKey((k) => k + 1)
    })
    return unsub
  }, [])

  return { sessions, loading }
}
