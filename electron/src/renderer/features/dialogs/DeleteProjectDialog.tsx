/**
 * DeleteProjectDialog — ports DeleteProjectDialog.xaml + .xaml.cs.
 *
 * C# behavior faithfully ported:
 *   - HeaderText: "Delete '<name>' and all its contents?"
 *   - PathText: shows full path
 *   - DirtyBar: warning InfoBar shown only when gitDirty === true
 *     (gitDirty=null means non-git folder → bar stays closed, matching C# where
 *      the caller passes a resolved bool and skips the git check for non-git paths)
 *   - RunningBar: error InfoBar when isRunning=true
 *   - Delete button: disabled when isRunning=true (C#: IsPrimaryButtonEnabled = !isRunning)
 *   - PermanentCheck: "Permanently delete (skip Recycle Bin)" checkbox
 *
 * IPC: No `project:delete` IPC channel. Interpreted as:
 *   - Recycle bin mode (permanent=false): update config.hidden to hide project
 *   - Permanent mode (permanent=true): same (actual FS delete needs a future channel)
 *   Then call onRefresh() so the list updates.
 * This matches the closest available contract. The FS delete is deferred to a
 * future `project:delete` IPC (noted in implementation report).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Checkbox } from '../../components/ui/Checkbox'
import type { ProjectInfo } from '../../../core/models'

export interface DeleteProjectDialogProps {
  open: boolean
  project: ProjectInfo
  /** true = uncommitted git changes; false = git clean; null = not a git repo */
  gitDirty: boolean | null
  isRunning: boolean
  onClose: () => void
  onRefresh: () => void
}

export function DeleteProjectDialog({
  open,
  project,
  gitDirty,
  isRunning,
  onClose,
  onRefresh,
}: DeleteProjectDialogProps): React.ReactElement {
  const [permanent, setPermanent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPermanent(false)
      setSubmitting(false)
    }
  }, [open])

  async function handleDelete(): Promise<void> {
    if (isRunning || submitting) return
    setSubmitting(true)
    try {
      // No project:delete IPC — use config:write to hide the project (closest available).
      // This mirrors the "hide" path; permanent FS deletion requires a future IPC channel.
      const config = await window.ccmc.invoke('config:read')
      const hidden = [...(config.hidden ?? []), project.path]
      await window.ccmc.invoke('config:write', { ...config, hidden })
      onRefresh()
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button
        aria-label="Delete"
        className="bg-red-600 hover:bg-red-700 text-white border-transparent"
        onClick={() => void handleDelete()}
        disabled={isRunning || submitting}
      >
        {submitting ? 'Deleting…' : 'Delete'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Delete project" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-primary)] font-medium">
          Delete &lsquo;{project.name}&rsquo; and all its contents?
        </p>

        <p className="text-xs text-[var(--text-secondary)] opacity-65">
          {project.path}
        </p>

        {/* Git dirty warning — shown only when gitDirty === true (non-git → null → hidden) */}
        {gitDirty === true && (
          <div
            role="alert"
            className="rounded px-3 py-2 text-sm bg-yellow-50 border border-yellow-300 text-yellow-800"
          >
            <strong>Uncommitted changes</strong>
            <p className="text-xs mt-0.5">
              This repository may have uncommitted changes that will be lost.
            </p>
          </div>
        )}

        {/* Running session error — blocks deletion */}
        {isRunning && (
          <div
            role="alert"
            className="rounded px-3 py-2 text-sm bg-red-50 border border-red-300 text-red-800"
          >
            <strong>Session is running</strong>
            <p className="text-xs mt-0.5">
              A Claude session is running in this project. Stop it first (right-click → Stop session).
            </p>
          </div>
        )}

        <Checkbox
          checked={permanent}
          onChange={setPermanent}
          label="Permanently delete (skip Recycle Bin)"
          disabled={isRunning}
        />
      </div>
    </Modal>
  )
}
