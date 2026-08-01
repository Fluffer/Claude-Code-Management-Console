import { useEffect } from 'react'
import { deepLinkParser } from '../../core/links/deepLinkParser'
import type { ProjectAction } from '../features/projects/projectActions'
import type { ProjectInfo } from '../../core/models'

export interface UseDeepLinkOptions {
  projects: ProjectInfo[]
  onAction: (action: ProjectAction) => void
  onUnresolved: (message: string) => void
  /**
   * Asked to confirm before the session starts. A deep link is the only launch
   * path not initiated from inside the app — anything able to invoke a protocol
   * URL reaches it — so the launch is gated rather than immediate.
   */
  onConfirm: (project: ProjectInfo, newSession: boolean) => void
}

export function useDeepLink({
  projects,
  onAction,
  onUnresolved,
  onConfirm,
}: UseDeepLinkOptions): void {
  useEffect(() => {
    const unsub = window.ccmc.on('event:deepLink', ({ url, trusted }) => {
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

      // The tray menu and jump list build ccmc:// URLs to reuse this delivery
      // path. Those are already a deliberate click in our own UI, so they launch
      // straight away; only links arriving from outside the app are confirmed.
      if (trusted === true) {
        onAction(
          link.newSession
            ? { kind: 'launch-new', project }
            : { kind: 'launch-continue', project },
        )
        return
      }

      onConfirm(project, link.newSession)
    })
    return unsub
  }, [projects, onAction, onUnresolved, onConfirm])
}
