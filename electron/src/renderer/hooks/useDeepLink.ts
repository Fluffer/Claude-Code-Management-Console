import { useEffect } from 'react'
import { deepLinkParser } from '../../core/links/deepLinkParser'
import type { ProjectAction } from '../features/projects/projectActions'
import type { ProjectInfo } from '../../core/models'

export interface UseDeepLinkOptions {
  projects: ProjectInfo[]
  onAction: (action: ProjectAction) => void
  onUnresolved: (message: string) => void
}

export function useDeepLink({ projects, onAction, onUnresolved }: UseDeepLinkOptions): void {
  useEffect(() => {
    const unsub = window.ccmc.on('event:deepLink', ({ url }) => {
      const link = deepLinkParser.parse(url)
      if (!link) return
      if (link.action.toLowerCase() !== 'launch') return

      const needle = link.project.toLowerCase()
      const project = projects.find(
        (p) => p.path.toLowerCase() === needle || p.name.toLowerCase() === needle,
      )

      if (!project) {
        onUnresolved(`Deep link: no project "${link.project}"`)
        return
      }

      onAction(
        link.newSession
          ? { kind: 'launch-new', project }
          : { kind: 'launch-continue', project },
      )
    })
    return unsub
  }, [projects, onAction, onUnresolved])
}
