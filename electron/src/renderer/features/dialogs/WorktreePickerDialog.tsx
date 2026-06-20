/**
 * WorktreePickerDialog — ports WorktreePickerDialog.xaml + .xaml.cs.
 *
 * Lists git worktrees via git:worktrees, lets the user pick one, then
 * launches a session in it via launch:run.
 *
 * C# behavior:
 *   - Each worktree item shows: branch (or "(detached)" if null), path
 *   - Primary button enabled only when a selection is made
 *   - On primary: launch via same mechanism as launch-new but with worktree.path
 *     as the workingDirectory
 *
 * IPC: git:worktrees (load), launch:run (launch session).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { GitWorktree, ProjectInfo } from '../../../core/models'

export interface WorktreePickerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function WorktreePickerDialog({
  open,
  project,
  onClose,
}: WorktreePickerDialogProps): React.ReactElement {
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([])
  const [selectedWorktree, setSelectedWorktree] = useState<GitWorktree | null>(null)
  const [loading, setLoading] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setWorktrees([])
    setSelectedWorktree(null)
    setError(null)
    setLaunching(false)
    setLoading(true)

    void window.ccmc.invoke('git:worktrees', { path: project.path })
      .then((wt) => {
        setWorktrees(wt)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  async function handleLaunch(): Promise<void> {
    if (!selectedWorktree || launching) return
    setLaunching(true)
    setError(null)
    try {
      // Use the worktree path as the project path so the session opens in the worktree
      const result = await window.ccmc.invoke('launch:run', {
        projectName: project.name,
        projectPath: selectedWorktree.path,
        continueSession: false,
        // Worktree targets a sibling path, not the tracked project — don't record usage.
        recordUsage: false,
      })
      if (!result.ok) {
        setError(result.error ?? 'Launch failed')
        setLaunching(false)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLaunching(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={launching}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleLaunch()}
        disabled={!selectedWorktree || launching}
      >
        {launching ? 'Launching…' : 'Launch'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title={`Worktrees — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[380px]">
        {loading && (
          <p className="text-xs text-[var(--text-secondary)]">Loading worktrees…</p>
        )}

        {!loading && !error && worktrees.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No git worktrees found for this project.
          </p>
        )}

        {!loading && worktrees.length > 0 && (
          <>
            <div className="flex flex-col gap-1 text-xs text-[var(--text-secondary)] pb-1 border-b border-[var(--divider)]">
              <div className="flex gap-3 font-medium">
                <span className="w-32">Branch</span>
                <span className="flex-1">Path</span>
              </div>
            </div>
            <div
              role="listbox"
              aria-label="Worktrees"
              className="flex flex-col border border-[var(--control-border)] rounded overflow-y-auto max-h-64"
            >
              {worktrees.map((wt) => {
                const isSelected = selectedWorktree?.path === wt.path
                const branch = wt.branch ?? '(detached)'
                return (
                  <div
                    key={wt.path}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelectedWorktree(wt)}
                    className={[
                      'flex gap-3 px-3 py-2 cursor-pointer text-sm',
                      isSelected
                        ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                        : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                    ].join(' ')}
                  >
                    <span className="w-32 font-mono truncate shrink-0" title={branch}>
                      {branch}
                    </span>
                    <span className="flex-1 truncate" title={wt.path}>
                      {wt.path}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
