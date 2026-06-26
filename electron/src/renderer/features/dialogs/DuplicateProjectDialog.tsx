/**
 * DuplicateProjectDialog — copy an on-disk project into a new folder, either as
 * a clean local `git clone` or an exact filesystem copy.
 */
import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { useToast } from '../../components/ui/Toast'
import { validateCloneName } from '../../../core/git/cloneName'
import { deriveDuplicateName } from '../../../core/projects/duplicateName'
import type { ProjectInfo } from '../../../core/models'

type Mode = 'git' | 'copy'

export interface DuplicateProjectDialogProps {
  open: boolean
  project: ProjectInfo
  projects: ProjectInfo[]
  roots: string[]
  defaultRoot: string | null
  isGitRepo: boolean
  onClose: () => void
  onRefresh: () => void
}

export function DuplicateProjectDialog({
  open,
  project,
  projects,
  roots,
  defaultRoot,
  isGitRepo,
  onClose,
  onRefresh,
}: DuplicateProjectDialogProps): React.ReactElement {
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>(isGitRepo ? 'git' : 'copy')
  const [selectedRoot, setSelectedRoot] = useState('')
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameTouchedRef = useRef(false)

  // Reset on open.
  useEffect(() => {
    if (!open) return
    setMode(isGitRepo ? 'git' : 'copy')
    const initialRoot = roots.includes(project.root) ? project.root : (defaultRoot ?? roots[0] ?? '')
    setSelectedRoot(initialRoot)
    const initialSiblings = projects.filter((p) => p.root === initialRoot).map((p) => p.name)
    setName(deriveDuplicateName(project.name, initialSiblings))
    setNameError(null)
    setBusy(false)
    setError(null)
    nameTouchedRef.current = false
  }, [open, isGitRepo, project.root, project.name, defaultRoot, roots, projects])

  // Derive a free default name from the source name + siblings in the root.
  useEffect(() => {
    if (!open || nameTouchedRef.current || !selectedRoot) return
    const siblings = projects.filter((p) => p.root === selectedRoot).map((p) => p.name)
    setName(deriveDuplicateName(project.name, siblings))
  }, [open, selectedRoot, projects, project.name])

  // Live-validate the name.
  useEffect(() => {
    if (!name) { setNameError(null); return }
    const result = validateCloneName(name)
    setNameError(result.ok ? null : result.reason)
  }, [name])

  function handleNameChange(value: string): void {
    nameTouchedRef.current = true
    setName(value)
  }

  const isValid = !nameError && name.trim().length > 0 && !!selectedRoot

  async function handleDuplicate(): Promise<void> {
    if (!isValid || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.ccmc.invoke('project:duplicate', {
        sourcePath: project.path,
        targetRoot: selectedRoot,
        name: name.trim(),
        mode,
      })
      if (!result.ok) {
        setError(result.error ?? 'Duplicate failed')
        setBusy(false)
        return
      }
      onRefresh()
      const newPath = result.path!
      const newName = name.trim()
      showToast(`Duplicated to ${newName}`, 'info', {
        label: 'Open session',
        onClick: () => {
          void window.ccmc.invoke('launch:run', {
            projectName: newName,
            projectPath: newPath,
            continueSession: false,
            recordUsage: false,
          })
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={busy}>Cancel</Button>
      <Button variant="accent" onClick={() => void handleDuplicate()} disabled={!isValid || busy}>
        {busy ? 'Duplicating…' : 'Duplicate'}
      </Button>
    </>
  )

  const selectClass = [
    'rounded px-2 py-1.5 text-sm bg-[var(--control-fill)]',
    'border border-[var(--control-border)] text-[var(--text-primary)]',
    'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
  ].join(' ')

  return (
    <Modal open={open} title="Duplicate project" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[380px]">
        <div className="text-xs text-[var(--text-secondary)]">
          Source: <span className="text-[var(--text-primary)]">{project.name}</span>
          <div className="truncate" title={project.path}>{project.path}</div>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold text-[var(--text-primary)] mb-1">Copy method</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="dup-mode"
              aria-label="Git clone (clean)"
              checked={mode === 'git'}
              disabled={!isGitRepo}
              onChange={() => setMode('git')}
            />
            <span className={isGitRepo ? '' : 'text-[var(--text-disabled)]'}>
              Git clone (clean — tracked files + history)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="dup-mode"
              aria-label="Exact copy"
              checked={mode === 'copy'}
              onChange={() => setMode('copy')}
            />
            <span>Exact copy (everything, incl. node_modules / .env)</span>
          </label>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-[var(--text-secondary)]" htmlFor="dup-name">Name</label>
          <TextInput id="dup-name" value={name} onChange={handleNameChange} aria-label="Name" />
          {nameError && <p className="text-xs text-red-500">{nameError}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-[var(--text-secondary)]" htmlFor="dup-root">Root</label>
          <select id="dup-root" aria-label="Root" className={selectClass} value={selectedRoot} onChange={(e) => setSelectedRoot(e.target.value)}>
            {roots.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      </div>
    </Modal>
  )
}
