/**
 * OpenPrDialog — push + open a GitHub PR for a project.
 *
 * On open: fetches git:info to learn branch + dirty state.
 * Fields: Title (prefilled from branch name), Body (optional textarea),
 * and a Commit message field rendered only when the tree is dirty (required).
 *
 * On success: shows the PR URL inline and opens it via shell:openPath, then closes.
 * Errors shown inline verbatim (covers gh not found, not authenticated, etc.).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import type { ProjectInfo } from '../../../core/models'

export interface OpenPrDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function OpenPrDialog({
  open,
  project,
  onClose,
}: OpenPrDialogProps): React.ReactElement {
  const [branch, setBranch] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBranch(null)
    setIsDirty(null)
    setLoading(true)
    setTitle('')
    setBody('')
    setCommitMessage('')
    setSubmitting(false)
    setError(null)
    setPrUrl(null)

    void window.ccmc.invoke('git:info', { path: project.path })
      .then((info) => {
        setBranch(info.branch)
        setIsDirty(info.isDirty)
        setTitle(info.branch)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  const dirty = isDirty === true
  const commitMessageRequired = dirty
  const canSubmit =
    !submitting &&
    !loading &&
    title.trim().length > 0 &&
    (!commitMessageRequired || commitMessage.trim().length > 0)

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.ccmc.invoke('git:openPr', {
        path: project.path,
        title: title.trim(),
        body: body.trim() || undefined,
        commitMessage: commitMessageRequired ? commitMessage.trim() : undefined,
      })
      if (!result.ok) {
        setError(result.error ?? 'Failed to open PR')
        setSubmitting(false)
        return
      }
      const url = result.url ?? null
      setPrUrl(url)
      if (url) {
        void window.ccmc.invoke('shell:openPath', { path: url })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
      >
        {submitting ? 'Opening PR…' : 'Open PR'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title={`Open PR — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        {loading && (
          <p className="text-xs text-[var(--text-secondary)]">Loading branch info…</p>
        )}

        {branch && (
          <p className="text-xs text-[var(--text-secondary)]">
            Branch: <span className="font-mono">{branch}</span>
          </p>
        )}

        {dirty && (
          <div className="flex flex-col gap-1">
            <label
              className="text-sm font-medium text-[var(--text-primary)]"
              htmlFor="pr-commit-message"
            >
              Commit message <span className="text-[var(--text-tertiary)]">(working tree is dirty)</span>
            </label>
            <TextInput
              id="pr-commit-message"
              aria-label="Commit message"
              value={commitMessage}
              onChange={setCommitMessage}
              placeholder="Commit staged changes before pushing…"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-[var(--text-primary)]"
            htmlFor="pr-title"
          >
            PR title
          </label>
          <TextInput
            id="pr-title"
            aria-label="PR title"
            value={title}
            onChange={setTitle}
            placeholder="Short description of the change"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            className="text-sm font-medium text-[var(--text-primary)]"
            htmlFor="pr-body"
          >
            PR body <span className="text-[var(--text-tertiary)]">(optional)</span>
          </label>
          <textarea
            id="pr-body"
            aria-label="PR body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Additional context, links, checklist…"
            className={[
              'rounded px-3 py-2 text-sm resize-y',
              'bg-[var(--control-fill)] border border-[var(--control-border)]',
              'text-[var(--text-primary)]',
              'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
            ].join(' ')}
          />
        </div>

        {prUrl && (
          <p className="text-xs text-[var(--text-secondary)]">
            PR created: <span className="font-mono break-all">{prUrl}</span>
          </p>
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
