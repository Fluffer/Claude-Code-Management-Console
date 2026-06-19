import React from 'react'
import { Button } from '../../components/ui/Button'

interface CommandBarProps {
  anySessionRunning: boolean
  onNewProject: () => void
  onRefresh: () => void
  onStopAll: () => void
}

/**
 * Bottom action bar — mirrors WinUI Grid.Row="3" in the content area.
 *
 *   New Project → dialog action (placeholder; wired in batch 4M)
 *   Refresh     → direct re-scan (no dialog; maps to ViewModel.RescanCommand)
 *   Stop All    → visible only when anySessionRunning=true
 *                 (mirrors ViewModel.AnySessionRunning binding on the Stop all button)
 */
export function CommandBar({
  anySessionRunning,
  onNewProject,
  onRefresh,
  onStopAll,
}: CommandBarProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between pt-2 border-t border-[var(--divider)] flex-shrink-0">
      <div className="flex items-center gap-2">
        <Button onClick={onNewProject} aria-label="New Project">
          + New Project
        </Button>
        <Button onClick={onRefresh} aria-label="Refresh">
          ↻ Refresh
        </Button>
      </div>
      {anySessionRunning && (
        <Button variant="subtle" onClick={onStopAll} aria-label="Stop all sessions">
          ■ Stop all
        </Button>
      )}
    </div>
  )
}
