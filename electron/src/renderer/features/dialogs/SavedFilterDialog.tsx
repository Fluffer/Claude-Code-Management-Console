/**
 * SavedFilterDialog — ports SavedFilterDialog.xaml + .xaml.cs.
 *
 * Create / edit / delete saved project filters. Mirrors GroupManagerDialog:
 * a list with Add/Remove plus an editor panel. The whole set is returned on Save.
 *
 * Fields per SavedFilter: name, pathContains, requireGit, requireClaudeMd,
 * requireRunning, requirePinned.
 *
 * Validation: name must be non-empty.
 *
 * IPC: state:read (load), state:write (save).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { Checkbox } from '../../components/ui/Checkbox'
import type { SavedFilter, AppState } from '../../../core/models'

function cloneFilter(f: SavedFilter): SavedFilter {
  return {
    name: f.name,
    pathContains: f.pathContains,
    requireGit: f.requireGit,
    requireClaudeMd: f.requireClaudeMd,
    requireRunning: f.requireRunning,
    requirePinned: f.requirePinned,
  }
}

function nextFilterName(filters: SavedFilter[]): string {
  const base = 'New filter'
  if (!filters.some((f) => f.name === base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!filters.some((f) => f.name === candidate)) return candidate
  }
}

export interface SavedFilterDialogProps {
  open: boolean
  onClose: () => void
  onRefresh: () => void
}

export function SavedFilterDialog({
  open,
  onClose,
  onRefresh,
}: SavedFilterDialogProps): React.ReactElement {
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)

  // Editor fields
  const [name, setName] = useState('')
  const [pathContains, setPathContains] = useState('')
  const [requireGit, setRequireGit] = useState(false)
  const [requireClaudeMd, setRequireClaudeMd] = useState(false)
  const [requireRunning, setRequireRunning] = useState(false)
  const [requirePinned, setRequirePinned] = useState(false)

  const current: SavedFilter | null =
    selectedIndex !== null ? (filters[selectedIndex] ?? null) : null

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)

    void window.ccmc.invoke('state:read').then((state) => {
      setAppState(state)
      const cloned = (state.savedFilters ?? []).map(cloneFilter)
      setFilters(cloned)
      if (cloned.length > 0) {
        setSelectedIndex(0)
        loadEditor(cloned[0])
      } else {
        setSelectedIndex(null)
        clearEditor()
      }
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [open])

  function loadEditor(f: SavedFilter): void {
    setName(f.name)
    setPathContains(f.pathContains ?? '')
    setRequireGit(f.requireGit)
    setRequireClaudeMd(f.requireClaudeMd)
    setRequireRunning(f.requireRunning)
    setRequirePinned(f.requirePinned)
  }

  function clearEditor(): void {
    setName('')
    setPathContains('')
    setRequireGit(false)
    setRequireClaudeMd(false)
    setRequireRunning(false)
    setRequirePinned(false)
  }

  function flushCurrentEditor(): void {
    if (selectedIndex === null) return
    setFilters((prev) =>
      prev.map((f, i) =>
        i === selectedIndex
          ? {
              ...f,
              name,
              pathContains: pathContains.trim() || null,
              requireGit,
              requireClaudeMd,
              requireRunning,
              requirePinned,
            }
          : f,
      ),
    )
  }

  function handleAdd(): void {
    flushCurrentEditor()
    const newFilter: SavedFilter = {
      name: nextFilterName(filters),
      pathContains: null,
      requireGit: false,
      requireClaudeMd: false,
      requireRunning: false,
      requirePinned: false,
    }
    setFilters((prev) => [...prev, newFilter])
    const newIndex = filters.length
    setSelectedIndex(newIndex)
    loadEditor(newFilter)
  }

  function handleRemove(): void {
    if (selectedIndex === null) return
    const next = filters.filter((_, i) => i !== selectedIndex)
    setFilters(next)
    const newSel = next.length === 0 ? null : Math.min(selectedIndex, next.length - 1)
    setSelectedIndex(newSel)
    if (newSel !== null && next[newSel]) {
      loadEditor(next[newSel])
    } else {
      clearEditor()
    }
  }

  function handleSelectFilter(index: number): void {
    flushCurrentEditor()
    setSelectedIndex(index)
    if (filters[index]) {
      loadEditor(filters[index])
    }
  }

  const nameError = current !== null && name.trim().length === 0
    ? 'Filter name is required.'
    : null

  async function handleSave(): Promise<void> {
    if (saving || !appState) return
    if (nameError) return

    // Flush current editor
    const flushed = filters.map((f, i) =>
      i === selectedIndex
        ? {
            ...f,
            name,
            pathContains: pathContains.trim() || null,
            requireGit,
            requireClaudeMd,
            requireRunning,
            requirePinned,
          }
        : f,
    )

    setSaving(true)
    setError(null)
    try {
      const next: AppState = { ...appState, savedFilters: flushed }
      await window.ccmc.invoke('state:write', next)
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const saveDisabled = saving || !appState || !!nameError

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={saving}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleSave()} disabled={saveDisabled}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Saved Filters" onClose={onClose} footer={footer}>
      <div className="flex gap-4 min-w-[480px] min-h-[300px]">
        {/* Left panel — filter list */}
        <div className="flex flex-col gap-2 w-40 shrink-0">
          <div className="flex gap-1">
            <Button onClick={handleAdd} className="flex-1 text-xs">
              + Add
            </Button>
            <Button onClick={handleRemove} variant="subtle" disabled={selectedIndex === null} className="text-xs">
              Remove
            </Button>
          </div>
          <div
            role="listbox"
            aria-label="Filters"
            className="flex-1 border border-[var(--control-border)] rounded overflow-y-auto"
          >
            {filters.map((f, i) => (
              <div
                key={i}
                role="option"
                aria-selected={selectedIndex === i}
                onClick={() => handleSelectFilter(i)}
                className={[
                  'px-2 py-1.5 text-sm cursor-pointer truncate',
                  selectedIndex === i
                    ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                    : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                ].join(' ')}
                title={f.name}
              >
                {f.name || '(unnamed)'}
              </div>
            ))}
            {filters.length === 0 && (
              <p className="p-2 text-xs text-[var(--text-secondary)]">No filters</p>
            )}
          </div>
        </div>

        {/* Right panel — editor */}
        <div className="flex flex-col gap-3 flex-1">
          {current === null && selectedIndex === null ? (
            <p className="text-sm text-[var(--text-secondary)]">Select or create a filter.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="filter-name">
                  Filter name
                </label>
                <TextInput
                  id="filter-name"
                  value={name}
                  onChange={setName}
                  aria-label="Filter name"
                  placeholder="Filter name"
                  disabled={selectedIndex === null}
                />
                {nameError && (
                  <p role="alert" className="text-xs text-red-500">
                    {nameError}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="filter-path">
                  Path contains (optional)
                </label>
                <TextInput
                  id="filter-path"
                  value={pathContains}
                  onChange={setPathContains}
                  aria-label="Path contains"
                  placeholder="e.g. /projects/work"
                  disabled={selectedIndex === null}
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">Conditions</p>
                <Checkbox
                  checked={requireGit}
                  onChange={setRequireGit}
                  label="Require git repository"
                  disabled={selectedIndex === null}
                />
                <Checkbox
                  checked={requireClaudeMd}
                  onChange={setRequireClaudeMd}
                  label="Require CLAUDE.md"
                  disabled={selectedIndex === null}
                />
                <Checkbox
                  checked={requireRunning}
                  onChange={setRequireRunning}
                  label="Require running session"
                  disabled={selectedIndex === null}
                />
                <Checkbox
                  checked={requirePinned}
                  onChange={setRequirePinned}
                  label="Require pinned"
                  disabled={selectedIndex === null}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-500 mt-2">
          {error}
        </p>
      )}
    </Modal>
  )
}
