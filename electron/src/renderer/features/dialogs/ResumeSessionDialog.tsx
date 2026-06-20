/**
 * ResumeSessionDialog — ports ResumeSessionDialog.xaml + .xaml.cs.
 *
 * Behavior:
 *   - Loads sessions via sessions:listHistory for the project
 *   - Each item shows: firstUserMessage (or sessionId if empty) + relative time
 *   - Resume button: disabled until selection made (mirrors IsPrimaryButtonEnabled=false default)
 *   - On Resume: calls launch:run with --resume <sessionId>
 *
 * IPC: sessions:listHistory, launch:run
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { formatRelativeTime } from '../../../core/util/relativeTimeFormatter'
import type { ProjectInfo, SessionSummary } from '../../../core/models'

export interface ResumeSessionDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function ResumeSessionDialog({
  open,
  project,
  onClose,
}: ResumeSessionDialogProps): React.ReactElement {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSessions([])
    setSelectedSessionId(null)
    setSubmitting(false)
    setLoading(true)

    void window.ccmc
      .invoke('sessions:listHistory', { projectPath: project.path })
      .then((result) => {
        setSessions(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [open, project.path])

  async function handleResume(): Promise<void> {
    if (!selectedSessionId || submitting) return
    setSubmitting(true)
    try {
      const result = await window.ccmc.invoke('launch:run', {
        projectName: project.name,
        projectPath: project.path,
        continueSession: false,
        flags: `--resume ${selectedSessionId}`,
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

  const now = new Date()

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleResume()}
        disabled={!selectedSessionId || submitting}
      >
        {submitting ? 'Resuming…' : 'Resume'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Resume a session" onClose={onClose} footer={footer}>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size="md" label="Loading sessions…" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] text-center py-4 opacity-70">
          No previous sessions found for this project.
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto -mx-2">
          {sessions.map((session) => {
            const display = session.firstUserMessage || session.sessionId
            const relTime = formatRelativeTime(new Date(session.lastWriteUtc), now)
            const isSelected = session.sessionId === selectedSessionId

            return (
              <li
                key={session.sessionId}
                className={[
                  'flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm',
                  isSelected
                    ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                    : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                ].join(' ')}
                onClick={() => setSelectedSessionId(session.sessionId)}
              >
                <span className="truncate flex-1">{display}</span>
                <span
                  className={[
                    'ml-3 text-[11px] flex-shrink-0',
                    isSelected ? 'opacity-75' : 'text-[var(--text-tertiary)]',
                  ].join(' ')}
                >
                  {relTime}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
