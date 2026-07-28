import { useState, useEffect, useRef } from 'react'
import { isOutdated } from '../../core/claude/claudeVersionInfo'

export interface UseClaudeVersionResult {
  version: string | null
  /** Latest version published to npm, or null when the check did not complete. */
  latestVersion: string | null
  /** True only when both versions are known and the installed one is older. */
  updateAvailable: boolean
}

/**
 * Fetches the installed claude CLI version and the latest published version,
 * once each on mount. Both are unmount-guarded and fail-soft: an unavailable
 * CLI or an unreachable registry leaves the value null, and isOutdated() never
 * nags on an unknown version.
 */
export function useClaudeVersion(): UseClaudeVersionResult {
  const [version, setVersion] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
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

  useEffect(() => {
    void window.ccmc.invoke('claude:latestVersion').then((result) => {
      if (mountedRef.current) {
        setLatestVersion(result.version)
      }
    }).catch(() => {
      // Offline or registry unreachable — no nudge, no error surfaced
    })
  }, [])

  return { version, latestVersion, updateAvailable: isOutdated(version, latestVersion) }
}
