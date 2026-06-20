import { useState, useEffect, useRef } from 'react'

export interface UseClaudeOnPathResult {
  onPath: boolean
}

/**
 * Checks whether the 'claude' CLI is available on PATH.
 *
 * Defaults to true until the first result resolves so the warning banner
 * never flashes on a healthy machine during startup.
 *
 * Re-checks on event:fileChanged (same invalidation pattern as useRunningSessions
 * and useProjectEnrichment — F5/refresh and file-system writes touch watched files).
 */
export function useClaudeOnPath(): UseClaudeOnPathResult {
  const [onPath, setOnPath] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  // Monotonic sequence: only the most recently STARTED check may commit its
  // result, so an out-of-order IPC resolution can't latch a stale value.
  const seqRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const seq = ++seqRef.current

    async function check(): Promise<void> {
      try {
        const result = await window.ccmc.invoke('claude:onPath')
        // Commit only if this is still the latest check and we're mounted.
        if (seq === seqRef.current && mountedRef.current) {
          setOnPath(result.onPath)
        }
      } catch {
        // Keep last-known value on failure
      }
    }

    void check()
  }, [refreshKey])

  useEffect(() => {
    const unsub = window.ccmc.on('event:fileChanged', () => {
      setRefreshKey((k) => k + 1)
    })
    return unsub
  }, [])

  return { onPath }
}
