/**
 * CommitDialog — git add -A + commit (optionally push) for a project.
 *
 * Shows current project name and branch (from project enrichment if available,
 * otherwise omits branch to avoid an extra fetch).
 * Requires a non-empty commit message. Two footer buttons: Commit and Commit & Push.
 * Errors shown inline (covers "nothing to commit").
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { ProjectInfo } from '../../../core/models'

export interface CommitDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
  onRefresh: () => void
}

export function CommitDialog({
  open,
  project,
  onClose,
  onRefresh,
}: CommitDialogProps): React.ReactElement {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMessage('')
    setSubmitting(false)
    setError(null)
  }, [open, project.path])

  async function handleCommit(push: boolean): Promise<void> {
    if (!message.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.ccmc.invoke('git:commit', {
        path: project.path,
        message: message.trim(),
        push,
      })
      if (!result.ok) {
        setError(result.error ?? 'Commit failed')
        setSubmitting(false)
        return
      }
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  const messageEmpty = !message.trim()

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button
        variant="subtle"
        onClick={() => void handleCommit(false)}
        disabled={messageEmpty || submitting}
      >
        {submitting ? 'Committing…' : 'Commit'}
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleCommit(true)}
        disabled={messageEmpty || submitting}
      >
        {submitting ? 'Committing…' : 'Commit & Push'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title={`Commit — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[380px]">
        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-[var(--text-primary)]"
            htmlFor="commit-message"
          >
            Commit message
          </label>
          <textarea
            id="commit-message"
            aria-label="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Describe your changes…"
            className={[
              'rounded px-3 py-2 text-sm resize-y',
              'bg-[var(--control-fill)] border border-[var(--control-border)]',
              'text-[var(--text-primary)]',
              'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
            ].join(' ')}
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
