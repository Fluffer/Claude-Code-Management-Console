/**
 * ConfirmDeepLinkDialog — confirms a ccmc://launch before starting a session.
 *
 * A deep link is the one launch path the user does not initiate from inside the
 * app: any document or page that can invoke a protocol URL reaches it. A
 * browser does prompt first, but the consent it collects is "open this app",
 * not "start an agent in this repo" — so ask here, where the actual
 * consequence can be stated, and name the permission mode the session will run
 * under so the consent is informed.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { currentPermissionMode } from '../../../core/config/flagsEditor'
import type { ProjectInfo } from '../../../core/models'

export interface ConfirmDeepLinkDialogProps {
  open: boolean
  project: ProjectInfo
  newSession: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDeepLinkDialog({
  open,
  project,
  newSession,
  onClose,
  onConfirm,
}: ConfirmDeepLinkDialogProps): React.ReactElement {
  const [mode, setMode] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode(null)
    // Effective mode = whatever the project's own flags say, else the app-wide
    // default. Mirrors withDefaultPermissionMode in the launch handler.
    void Promise.all([window.ccmc.invoke('config:read'), window.ccmc.invoke('state:read')])
      .then(([cfg, state]) => {
        const flags = cfg.projects?.[project.path]?.flags ?? ''
        setMode(currentPermissionMode(flags) ?? state.defaultPermissionMode ?? '')
      })
      .catch(() => setMode(''))
  }, [open, project.path])

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle">
        Cancel
      </Button>
      <Button variant="accent" onClick={onConfirm}>
        {newSession ? 'Start new session' : 'Continue session'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Open this link?" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-2 min-w-[420px]">
        <p className="text-sm text-[var(--text-primary)]">
          A link is asking to {newSession ? 'start a new Claude session' : 'continue the Claude session'} in:
        </p>
        <p className="text-sm font-mono break-all text-[var(--text-primary)]">{project.path}</p>
        <p className="text-xs text-[var(--text-secondary)]">
          {mode === null
            ? 'Checking permission mode…'
            : mode === ''
              ? 'Permission mode: whatever the claude CLI defaults to.'
              : `Permission mode: ${mode}.`}{' '}
          Claude will be able to read and change files in that folder. Cancel if you did not
          expect this.
        </p>
      </div>
    </Modal>
  )
}
