/**
 * CommandPickerDialog — lists a project's Claude slash commands and launches
 * one. Picking a command opens a fresh Claude session in the terminal with the
 * command pre-filled as the initial prompt (`/<name>`), reusing launch:run.
 *
 * IPC: commands:list (load), launch:run (act), shell:openInVscode (edit).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { CommandInfo, ProjectInfo } from '../../../core/models'

export interface CommandPickerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function CommandPickerDialog({
  open,
  project,
  onClose,
}: CommandPickerDialogProps): React.ReactElement {
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCommands([])
    setError(null)
    setLoading(true)

    void window.ccmc.invoke('commands:list', { path: project.path })
      .then((result) => {
        setCommands(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  function runCommand(name: string): void {
    void window.ccmc.invoke('launch:run', {
      projectName: project.name,
      projectPath: project.path,
      continueSession: false,
      initialPrompt: `/${name}`,
    })
    onClose()
  }

  function openFolder(): void {
    void window.ccmc.invoke('shell:openInVscode', { path: `${project.path}/.claude/commands` })
  }

  const footer = (
    <>
      <Button onClick={openFolder} variant="subtle">Open in VS Code</Button>
      <Button onClick={onClose} variant="subtle">Close</Button>
    </>
  )

  return (
    <Modal open={open} title={`Run command — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[360px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading…</p>}

        {!loading && !error && commands.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No slash commands configured in this project.
          </p>
        )}

        {!loading && commands.length > 0 && (
          <div className="flex flex-col gap-1">
            {commands.map((cmd) => (
              <button
                key={cmd.name}
                type="button"
                onClick={() => runCommand(cmd.name)}
                className="flex flex-col items-start gap-0.5 text-left px-2 py-1.5 rounded hover:bg-[var(--subtle-fill)] focus:outline-none focus:bg-[var(--subtle-fill)]"
              >
                <span className="font-mono text-sm text-[var(--text-primary)]">/{cmd.name}</span>
                {cmd.description && (
                  <span className="text-xs text-[var(--text-secondary)]">{cmd.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
