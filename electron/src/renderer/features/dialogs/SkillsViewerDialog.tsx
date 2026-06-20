/**
 * SkillsViewerDialog — read-only viewer for a project's Claude skills.
 * Loads <project>/.claude/skills/*\/SKILL.md via skills:list and shows each
 * skill's name + description. "Open in VS Code" opens the skills folder.
 *
 * IPC: skills:list (load), shell:openInVscode (edit affordance).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import type { SkillInfo, ProjectInfo } from '../../../core/models'

export interface SkillsViewerDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
}

export function SkillsViewerDialog({
  open,
  project,
  onClose,
}: SkillsViewerDialogProps): React.ReactElement {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSkills([])
    setError(null)
    setLoading(true)

    void window.ccmc.invoke('skills:list', { path: project.path })
      .then((result) => {
        setSkills(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  function openFolder(): void {
    void window.ccmc.invoke('shell:openInVscode', { path: `${project.path}/.claude/skills` })
  }

  const footer = (
    <>
      <Button onClick={openFolder} variant="subtle">Open in VS Code</Button>
      <Button onClick={onClose} variant="subtle">Close</Button>
    </>
  )

  return (
    <Modal open={open} title={`Skills — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[360px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading…</p>}

        {!loading && !error && skills.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No skills configured in this project.
          </p>
        )}

        {!loading && skills.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex gap-3 text-xs font-medium text-[var(--text-secondary)] pb-1 border-b border-[var(--divider)]">
              <span className="w-40">Skill</span>
              <span className="flex-1">Description</span>
            </div>
            {skills.map((skill) => (
              <div key={skill.name} className="flex gap-3 py-1.5 text-sm">
                <span className="w-40 font-mono text-[var(--text-primary)] truncate" title={skill.name}>
                  {skill.name}
                </span>
                <span className="flex-1 text-[var(--text-secondary)]">
                  {skill.description ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
