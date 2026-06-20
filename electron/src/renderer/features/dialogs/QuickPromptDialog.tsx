/**
 * QuickPromptDialog — ports QuickPromptDialog.xaml + .xaml.cs.
 *
 * Fields:
 *   - Multi-line prompt textarea (AcceptsReturn=True in XAML)
 *   - Launch button: disabled when prompt is empty/whitespace (mirrors IsPrimaryButtonEnabled=false)
 *
 * IPC: launch:run — builds a LaunchSpec with the prompt as the --print argument
 * to `claude`, targeting the project's working directory.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { ProjectInfo } from '../../../core/models'

export interface QuickPromptDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function QuickPromptDialog({
  open,
  project,
  onClose,
}: QuickPromptDialogProps): React.ReactElement {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setPrompt('')
      setSubmitting(false)
    }
  }, [open])

  const isValid = !!prompt.trim()

  async function handleLaunch(): Promise<void> {
    if (!isValid || submitting) return
    setSubmitting(true)
    try {
      const result = await window.ccmc.invoke('launch:run', {
        projectName: project.name,
        projectPath: project.path,
        continueSession: false,
        initialPrompt: prompt.trim(),
      })
      if (!result.ok) {
        setSubmitting(false)
        return
      }
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
      <Button variant="accent" onClick={() => void handleLaunch()} disabled={!isValid || submitting}>
        {submitting ? 'Launching…' : 'Launch'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Quick prompt" onClose={onClose} footer={footer}>
      <textarea
        data-testid="quick-prompt-input"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Type the first message to send to Claude…"
        rows={4}
        autoFocus
        className={[
          'w-full rounded px-3 py-2 text-sm resize-y',
          'bg-[var(--control-fill)] border border-[var(--control-border)]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
          'focus:outline focus:outline-2 focus:outline-[var(--accent)] focus:border-transparent',
        ].join(' ')}
      />
    </Modal>
  )
}
