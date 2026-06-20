/**
 * MoveToRootDialog — lets the user pick one of the configured roots and moves
 * the selected project there.
 *
 * Mirrors MainViewModel.MoveToRoot: reads config.roots, shows a picker, calls
 * projects:move IPC, then refreshes the list.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { ProjectInfo } from '../../../core/models'

export interface MoveToRootDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
  onRefresh: () => void
}

export function MoveToRootDialog({
  open,
  project,
  onClose,
  onRefresh,
}: MoveToRootDialogProps): React.ReactElement {
  const [roots, setRoots] = useState<string[]>([])
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedRoot(null)
    setError(null)
    setMoving(false)
    setLoading(true)
    void window.ccmc.invoke('config:read').then((cfg) => {
      // Filter out the current project's parent so user can't "move" to same root
      const currentParent = project.path.replace(/[\\/][^\\/]+$/, '')
      const available = (cfg.roots ?? []).filter(
        (r) => r.toLowerCase() !== currentParent.toLowerCase(),
      )
      setRoots(available)
      setLoading(false)
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })
  }, [open, project.path])

  async function handleMove(): Promise<void> {
    if (!selectedRoot || moving) return
    setMoving(true)
    setError(null)
    try {
      const result = await window.ccmc.invoke('projects:move', {
        path: project.path,
        targetRoot: selectedRoot,
      })
      if (!result.ok) {
        setError('Move failed')
        setMoving(false)
        return
      }
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setMoving(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={moving}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleMove()}
        disabled={!selectedRoot || moving}
      >
        {moving ? 'Moving…' : 'Move'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title={`Move "${project.name}" to root`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[380px]">
        {loading && (
          <p className="text-xs text-[var(--text-secondary)]">Loading roots…</p>
        )}

        {!loading && roots.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No other roots configured. Add a root in Settings first.
          </p>
        )}

        {!loading && roots.length > 0 && (
          <div
            role="listbox"
            aria-label="Target root"
            className="flex flex-col border border-[var(--control-border)] rounded overflow-y-auto max-h-48"
          >
            {roots.map((root) => {
              const isSelected = selectedRoot === root
              return (
                <div
                  key={root}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedRoot(root)}
                  className={[
                    'px-3 py-2 cursor-pointer text-sm truncate',
                    isSelected
                      ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                      : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                  ].join(' ')}
                  title={root}
                >
                  {root}
                </div>
              )
            })}
          </div>
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
