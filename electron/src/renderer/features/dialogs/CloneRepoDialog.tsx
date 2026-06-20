/**
 * CloneRepoDialog — clone a git URL into a chosen source root.
 *
 * Fields: URL (required), Name (prefilled from deriveCloneName, user-editable),
 * Root (select from roots, default defaultRoot).
 *
 * On success: refresh the project list, then launch a new session in the clone.
 */
import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { deriveCloneName, validateCloneName } from '../../../core/git/cloneName'

export interface CloneRepoDialogProps {
  open: boolean
  roots: string[]
  defaultRoot: string | null
  onClose: () => void
  onRefresh: () => void
}

export function CloneRepoDialog({
  open,
  roots,
  defaultRoot,
  onClose,
  onRefresh,
}: CloneRepoDialogProps): React.ReactElement {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [selectedRoot, setSelectedRoot] = useState<string>('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track whether the user has manually edited the name field
  const nameTouchedRef = useRef(false)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setUrl('')
    setName('')
    setSelectedRoot(defaultRoot ?? roots[0] ?? '')
    setNameError(null)
    setCloning(false)
    setError(null)
    nameTouchedRef.current = false
  }, [open, defaultRoot, roots])

  // Prefill name from URL when user hasn't manually edited it
  useEffect(() => {
    if (nameTouchedRef.current) return
    const derived = deriveCloneName(url)
    setName(derived)
  }, [url])

  // Live validate name
  useEffect(() => {
    if (!name) {
      setNameError(null)
      return
    }
    const result = validateCloneName(name)
    setNameError(result.ok ? null : result.reason)
  }, [name])

  function handleNameChange(value: string): void {
    nameTouchedRef.current = true
    setName(value)
  }

  const isValid = url.trim().length > 0 && !nameError && name.trim().length > 0 && !!selectedRoot

  async function handleClone(): Promise<void> {
    if (!isValid || cloning) return
    setCloning(true)
    setError(null)
    try {
      const result = await window.ccmc.invoke('git:clone', {
        url: url.trim(),
        targetRoot: selectedRoot,
        name: name.trim(),
      })
      if (!result.ok) {
        setError(result.error ?? 'Clone failed')
        setCloning(false)
        return
      }
      onRefresh()
      await window.ccmc.invoke('launch:run', {
        projectName: name.trim(),
        projectPath: result.path!,
        continueSession: false,
        recordUsage: false,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCloning(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={cloning}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleClone()}
        disabled={!isValid || cloning}
      >
        {cloning ? 'Cloning…' : 'Clone'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Clone Repository" onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[400px]">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="clone-url">
            Repository URL
          </label>
          <TextInput
            id="clone-url"
            aria-label="Repository URL"
            value={url}
            onChange={setUrl}
            placeholder="https://github.com/owner/repo.git"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="clone-name">
            Folder name
          </label>
          <TextInput
            id="clone-name"
            aria-label="Folder name"
            value={name}
            onChange={handleNameChange}
            placeholder="repo-name"
          />
          {nameError && (
            <p role="alert" className="text-xs text-red-500 mt-0.5">
              {nameError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-primary)]" htmlFor="clone-root">
            Clone into
          </label>
          <select
            id="clone-root"
            aria-label="Clone into"
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
          {roots.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">
              No source roots configured — add one in Settings first.
            </p>
          )}
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
