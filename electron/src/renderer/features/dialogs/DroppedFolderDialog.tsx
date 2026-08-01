/**
 * DroppedFolderDialog — asks what to do with a single folder dropped on the
 * window: keep it as a source root, or start a one-off Claude session in it.
 *
 * A drop is ambiguous. "Add as source root" is right for a projects folder and
 * wrong for a single repo you just want to poke at; a modifier key would make
 * the second option undiscoverable, so ask instead. Dropping several folders at
 * once skips this and adds them all as roots — launching N sessions from one
 * gesture is not something anyone means to do.
 */
import React, { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'

export interface DroppedFolderDialogProps {
  open: boolean
  path: string
  onClose: () => void
  onRefresh: () => void
  onToast: (message: string, kind: 'info' | 'error') => void
}

/** Folder leaf, for the session name and the button labels. */
function leafName(p: string): string {
  const parts = p.split(/[\\/]/).filter((s) => s.length > 0)
  return parts.length > 0 ? parts[parts.length - 1] : p
}

export function DroppedFolderDialog({
  open,
  path,
  onClose,
  onRefresh,
  onToast,
}: DroppedFolderDialogProps): React.ReactElement {
  const [busy, setBusy] = useState(false)
  const name = leafName(path)

  async function handleAddRoot(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const { added } = await window.ccmc.invoke('config:addRoots', { paths: [path] })
      if (added === 0) {
        onToast('Nothing added — already a source root', 'info')
      } else {
        onRefresh()
        onToast('Added 1 source root', 'info')
      }
      onClose()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
      setBusy(false)
    }
  }

  async function handleLaunch(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      // recordUsage: false — a dropped folder is not necessarily a tracked
      // project, so it must not enter lastUsed or the recents MRU. Same posture
      // as worktree launches, which also target a path outside the project list.
      const result = await window.ccmc.invoke('launch:run', {
        projectName: name,
        projectPath: path,
        continueSession: false,
        recordUsage: false,
      })
      if (result.ok) {
        onToast(`Launched Claude in ${name}`, 'info')
        onClose()
      } else {
        onToast(result.error ?? 'Launch failed', 'error')
        setBusy(false)
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={busy}>
        Cancel
      </Button>
      <Button onClick={() => void handleAddRoot()} disabled={busy}>
        Add as source root
      </Button>
      <Button variant="accent" onClick={() => void handleLaunch()} disabled={busy}>
        Launch Claude here
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Dropped a folder" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-2 min-w-[420px]">
        <p className="text-sm text-[var(--text-primary)] font-mono break-all">{path}</p>
        <p className="text-xs text-[var(--text-secondary)]">
          Add it as a source root to scan every project inside it, or start a one-off session
          in this folder. A one-off launch is not added to the project list or to Recent.
        </p>
      </div>
    </Modal>
  )
}
