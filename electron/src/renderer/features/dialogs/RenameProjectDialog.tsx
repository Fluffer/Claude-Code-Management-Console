/**
 * RenameProjectDialog — ports RenameProjectDialog.xaml + .xaml.cs.
 *
 * Fields:
 *   - Current name context text (mirrors "Renaming '<name>' in <parentDir>")
 *   - New name input (pre-populated with current name, all selected)
 *   - Validation via projectNameValidator
 *   - Warning: history tied to path, Continue will start fresh
 *
 * IPC: projects:rename — delegates to projectMover.renameProject on the main process.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { projectNameValidator } from '../../../core/projects/projectNameValidator'
import type { ProjectInfo } from '../../../core/models'

export interface RenameProjectDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
  onRefresh: () => void
}

function parentDir(path: string): string {
  const t = path.replace(/[/\\]+$/, '')
  const idx = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
  return idx >= 0 ? t.slice(0, idx) : path
}

export function RenameProjectDialog({
  open,
  project,
  onClose,
  onRefresh,
}: RenameProjectDialogProps): React.ReactElement {
  const [newName, setNewName] = useState(project.name)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const parent = parentDir(project.path)

  // Reset on open
  useEffect(() => {
    if (open) {
      setNewName(project.name)
      setValidationError(null)
      setSubmitting(false)
    }
  }, [open, project.name])

  // Live validation — mirrors NameBox_TextChanged
  useEffect(() => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === project.name) {
      setValidationError(null)
      return
    }
    const error = projectNameValidator.getError(trimmed, () => false, parent)
    setValidationError(error)
  }, [newName, project.name, parent])

  const isChanged = newName.trim() !== project.name
  const isValid = isChanged && !validationError && !!newName.trim()

  async function handleRename(): Promise<void> {
    if (!isValid || submitting) return
    const trimmed = newName.trim()

    const error = projectNameValidator.getError(trimmed, () => false, parent)
    if (error) {
      setValidationError(error)
      return
    }

    setSubmitting(true)
    try {
      await window.ccmc.invoke('projects:rename', { path: project.path, newName: trimmed })
      onRefresh()
      onClose()
    } catch (err) {
      setValidationError(
        `Could not rename: ${err instanceof Error ? err.message : String(err)} ` +
        'If a Claude session or another program has files open in this folder, close it and try again.',
      )
      setSubmitting(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleRename()} disabled={!isValid || submitting}>
        {submitting ? 'Renaming…' : 'Rename'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Rename Project" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-primary)]">
          Renaming &ldquo;{project.name}&rdquo; in {parent}
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="rename-name">
            New name
          </label>
          <TextInput
            id="rename-name"
            aria-label="New name"
            value={newName}
            onChange={setNewName}
            autoFocus
          />
          {validationError && (
            <p role="alert" className="text-xs text-red-500 mt-0.5">
              {validationError}
            </p>
          )}
        </div>

        <p className="text-xs text-[var(--text-secondary)] opacity-65">
          Note: Claude session history is tied to the folder path, so Continue will start fresh
          after renaming (old transcripts are not deleted). Close any session running in this
          folder first.
        </p>
      </div>
    </Modal>
  )
}
