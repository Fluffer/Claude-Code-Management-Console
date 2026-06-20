/**
 * NewProjectDialog — ports NewProjectDialog.xaml + .xaml.cs.
 *
 * Fields:
 *   - Project name (validated via projectNameValidator)
 *   - Create in: select from existing roots OR browse for folder (dialog:pickFolder)
 *   - Launch Claude after creating checkbox (default: checked)
 *
 * On submit: calls projects:create to create the folder, then calls onRefresh().
 * IPC used: dialog:pickFolder (browse), projects:create (folder creation).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { Checkbox } from '../../components/ui/Checkbox'
import { projectNameValidator } from '../../../core/projects/projectNameValidator'

export interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
  onRefresh: () => void
  roots: string[]
}

export function NewProjectDialog({
  open,
  onClose,
  onRefresh,
  roots,
}: NewProjectDialogProps): React.ReactElement {
  const [name, setName] = useState('')
  const [selectedRoot, setSelectedRoot] = useState<string>(roots[0] ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [launchAfter, setLaunchAfter] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setName('')
      setSelectedRoot(roots[0] ?? '')
      setValidationError(null)
      setLaunchAfter(true)
      setSubmitting(false)
    }
  }, [open, roots])

  // Live validation
  useEffect(() => {
    if (!name.trim()) {
      setValidationError(null)
      return
    }
    if (!selectedRoot) {
      setValidationError('No destination root available — add one in Settings first.')
      return
    }
    const error = projectNameValidator.getError(
      name,
      () => false, // filesystem check not available in renderer; server validates on create
      selectedRoot,
    )
    setValidationError(error)
  }, [name, selectedRoot])

  const isValid = !!name.trim() && !validationError && !!selectedRoot

  async function handleBrowse(): Promise<void> {
    const result = await window.ccmc.invoke('dialog:pickFolder', { title: 'Select root folder' })
    if (result.path) {
      setSelectedRoot(result.path)
    }
  }

  async function handleCreate(): Promise<void> {
    if (!isValid || submitting) return
    const trimmedName = name.trim()
    if (!selectedRoot) {
      setValidationError('No destination root available.')
      return
    }
    const error = projectNameValidator.getError(trimmedName, () => false, selectedRoot)
    if (error) {
      setValidationError(error)
      return
    }

    setSubmitting(true)
    try {
      await window.ccmc.invoke('projects:create', { root: selectedRoot, name: trimmedName })
      onRefresh()
      onClose()
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleCreate()} disabled={!isValid || submitting}>
        {submitting ? 'Creating…' : 'Create'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="New Project" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="new-project-name">
            Project name
          </label>
          <TextInput
            id="new-project-name"
            aria-label="Project name"
            value={name}
            onChange={setName}
            placeholder="my-new-project"
            autoFocus
          />
          {validationError && (
            <p role="alert" className="text-xs text-red-500 mt-0.5">
              {validationError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="new-project-root">
            Create in
          </label>
          <div className="flex gap-2">
            <select
              id="new-project-root"
              aria-label="Create in"
              value={selectedRoot}
              onChange={(e) => setSelectedRoot(e.target.value)}
              className={[
                'flex-1 rounded px-3 py-1.5 text-sm',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
              ].join(' ')}
            >
              {roots.map((root) => (
                <option key={root} value={root}>
                  {root}
                </option>
              ))}
            </select>
            <Button onClick={() => void handleBrowse()} variant="subtle" aria-label="Browse for folder">
              Browse…
            </Button>
          </div>
        </div>

        <Checkbox
          checked={launchAfter}
          onChange={setLaunchAfter}
          label="Start a Claude session after creating"
        />
      </div>
    </Modal>
  )
}
