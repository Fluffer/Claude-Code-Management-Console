/**
 * ResumeSessionDialog — session browser + resume.
 *
 * Left pane: resumable sessions (sessions:listHistory). Selecting one loads its
 * transcript (sessions:readTranscript, lazy) into the right pane, which offers a
 * text filter. The header shows total project cost (sessions:cost, loaded once).
 * Resume launches `claude --resume <sessionId>` (unchanged).
 *
 * IPC: sessions:listHistory, sessions:readTranscript, sessions:cost, launch:run
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { formatRelativeTime } from '../../../core/util/relativeTimeFormatter'
import { computeCost } from '../../../core/cost/costCalculator'
import type { ProjectInfo, SessionSummary, TranscriptMessage } from '../../../core/models'

export interface ResumeSessionDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

/** Formats a USD amount: `$1.23`, `<$0.01` for tiny non-zero, `$0.00` for zero. */
function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
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

  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [projectCostLabel, setProjectCostLabel] = useState<string | null>(null)

  // Load the session list + project cost when the dialog opens.
  useEffect(() => {
    if (!open) return
    setSessions([])
    setSelectedSessionId(null)
    setSubmitting(false)
    setTranscript([])
    setFilter('')
    setProjectCostLabel(null)
    setLoading(true)

    void window.ccmc
      .invoke('sessions:listHistory', { projectPath: project.path })
      .then((result) => {
        setSessions(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    void window.ccmc
      .invoke('sessions:cost', { projectPath: project.path })
      .then((cost) => {
        const label = formatUsd(cost.usd) + (cost.hasUnknownModel ? ' +unknown' : '')
        setProjectCostLabel(`${label} · ${cost.sessionCount} session${cost.sessionCount === 1 ? '' : 's'}`)
      })
      .catch(() => setProjectCostLabel(null))
  }, [open, project.path])

  // Lazy-load the selected session's transcript.
  useEffect(() => {
    if (!open || selectedSessionId === null) {
      setTranscript([])
      return
    }
    let cancelled = false
    setTranscriptLoading(true)
    setTranscript([])
    void window.ccmc
      .invoke('sessions:readTranscript', { projectPath: project.path, sessionId: selectedSessionId })
      .then((msgs) => {
        if (cancelled) return
        setTranscript(msgs)
        setTranscriptLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setTranscriptLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selectedSessionId, project.path])

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
  const sessionCost = computeCost(transcript)
  const visible = filter.trim()
    ? transcript.filter((m) => m.text.toLowerCase().includes(filter.toLowerCase()))
    : transcript

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={submitting}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleResume()} disabled={!selectedSessionId || submitting}>
        {submitting ? 'Resuming…' : 'Resume'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Sessions" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-2 min-w-[720px]">
        {projectCostLabel && (
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Project cost: <span className="font-mono">{projectCostLabel}</span>
          </p>
        )}

        <div className="flex gap-3">
          {/* Left: session list */}
          <div className="w-72 flex-shrink-0">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="md" label="Loading sessions…" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4 opacity-70">
                No previous sessions found for this project.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto -mx-1">
                {sessions.map((session) => {
                  const display = session.firstUserMessage || session.sessionId
                  const relTime = formatRelativeTime(new Date(session.lastWriteUtc), now)
                  const isSelected = session.sessionId === selectedSessionId
                  return (
                    <li
                      key={session.sessionId}
                      className={[
                        'flex flex-col px-2 py-1.5 rounded cursor-pointer text-sm',
                        isSelected
                          ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                          : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                      ].join(' ')}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                    >
                      <span className="truncate">{display}</span>
                      <span
                        className={[
                          'text-[11px]',
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
          </div>

          {/* Right: transcript preview */}
          <div className="flex-1 min-w-0 border-l border-[var(--divider)] pl-3">
            {selectedSessionId === null ? (
              <p className="text-sm text-[var(--text-secondary)] py-4 opacity-70">
                Select a session to preview its transcript.
              </p>
            ) : transcriptLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner size="md" label="Loading transcript…" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter messages…"
                    className="flex-1 px-2 py-1 text-sm rounded bg-[var(--subtle-fill)] text-[var(--text-primary)] focus:outline-none"
                  />
                  <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0 font-mono">
                    {formatUsd(sessionCost.usd)}{sessionCost.hasUnknownModel ? ' +?' : ''}
                  </span>
                </div>
                <ul className="max-h-72 overflow-y-auto flex flex-col gap-2">
                  {visible.length === 0 ? (
                    <li className="text-xs text-[var(--text-secondary)] opacity-70">No messages.</li>
                  ) : (
                    visible.map((m, i) => (
                      <li key={i} className="text-xs">
                        <span
                          className={[
                            'font-medium',
                            m.role === 'assistant' ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]',
                          ].join(' ')}
                        >
                          {m.role}
                          {m.model ? ` · ${m.model}` : ''}
                        </span>
                        <p className="whitespace-pre-wrap break-words text-[var(--text-primary)] mt-0.5">
                          {m.text || '—'}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
