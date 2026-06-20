import { useState, useEffect, useRef } from 'react'

export interface UseClaudeVersionResult {
  version: string | null
}

/**
 * Fetches the claude CLI version once on mount via claude:version IPC.
 * Returns { version: string | null }. Unmount-guarded to prevent state
 * updates on an unmounted component.
 */
export function useClaudeVersion(): UseClaudeVersionResult {
  const [version, setVersion] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    void window.ccmc.invoke('claude:version').then((result) => {
      if (mountedRef.current) {
        setVersion(result.version)
      }
    }).catch(() => {
      // Fail-soft: leave version as null
    })
  }, [])

  return { version }
}
