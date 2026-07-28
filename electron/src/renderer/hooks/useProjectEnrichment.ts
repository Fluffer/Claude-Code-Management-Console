/**
 * useProjectEnrichment — async per-project enrichment hook.
 *
 * For each visible project, fetches git:info and derives enrichment data
 * that fills ProjectRow badges (branch, dirty dot, CLAUDE.md, MCP, etc.).
 *
 * Concurrency: cap at CONCURRENCY_LIMIT simultaneous IPC calls to avoid
 * flooding main with 500 git:info requests at once (mirrors MainViewModel
 * StartEnrichment which uses Task.WhenAll with a SemaphoreSlim(8)).
 *
 * Cache: results are cached by path; invalidated on event:fileChanged so
 * the UI refreshes when the file system changes (e.g., git commit).
 */
import { useState, useEffect, useRef } from 'react'
import type { ProjectInfo } from '../../core/models'
import type { ProjectEnrichment } from '../features/projects/ProjectRow'

const CONCURRENCY_LIMIT = 8

export interface UseProjectEnrichmentResult {
  enrichments: Record<string, ProjectEnrichment>
}

/** A thin semaphore that limits concurrent async operations. */
async function withConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<Array<T | null>> {
  const results: Array<T | null> = new Array(tasks.length).fill(null)
  let index = 0

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      try {
        results[i] = await tasks[i]()
      } catch {
        // leave null; caller handles gracefully
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function useProjectEnrichment(projects: ProjectInfo[]): UseProjectEnrichmentResult {
  const [enrichments, setEnrichments] = useState<Record<string, ProjectEnrichment>>({})
  const [invalidateKey, setInvalidateKey] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Subscribe to file-change events to invalidate cache
  useEffect(() => {
    const unsub = window.ccmc.on('event:fileChanged', () => {
      // Clear cache and re-enrich
      setEnrichments({})
      setInvalidateKey((k) => k + 1)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (projects.length === 0) return

    let cancelled = false

    async function enrich(): Promise<void> {
      const tasks = projects.map((project) => async (): Promise<void> => {
        if (cancelled) return
        try {
          const [gitInfo, claudeInfo] = await Promise.all([
            window.ccmc.invoke('git:info', { path: project.path }),
            window.ccmc.invoke('projects:claudeInfo', { path: project.path }),
          ])
          if (cancelled || !mountedRef.current) return

          const enrichment: ProjectEnrichment = {
            // git:info returns '' (not null) for non-git paths — normalize so
            // gitBranch is null when absent (gates the worktree menu item, hasGit filter).
            gitBranch: gitInfo.branch || null,
            gitDirty: gitInfo.isDirty ?? null,
            hasClaudeMd: claudeInfo.hasClaudeMd,
            hasMcp: claudeInfo.hasMcp,
            hasCommands: claudeInfo.hasCommands,
            hasSkills: claudeInfo.hasSkills,
            hasSettingsError: claudeInfo.settingsError !== null,
            settingsError: claudeInfo.settingsError ?? '',
            // Continue only works when the project has a past session on disk.
            hasSession: claudeInfo.newestSessionUtc !== null,
            // Staleness also depends on whether a session is running right now,
            // which this hook does not know — ProjectRow applies that rule.
            newestSessionUtc: claudeInfo.newestSessionUtc,
            defaultModel: claudeInfo.defaultModel,
          }

          setEnrichments((prev) => ({ ...prev, [project.path]: enrichment }))
        } catch {
          // git:info or projects:claudeInfo failed — leave enrichment absent
        }
      })

      await withConcurrencyLimit(tasks, CONCURRENCY_LIMIT)
    }

    void enrich()

    return () => {
      cancelled = true
    }
  }, [projects, invalidateKey])

  return { enrichments }
}
