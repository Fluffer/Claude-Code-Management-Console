/**
 * GroupManagerDialog — ports GroupManagerDialog.xaml + .xaml.cs.
 *
 * Manage LaunchGroups in AppState: create/rename/delete/reorder/assign projects.
 * Saves the whole group set at once via state:write.
 *
 * IPC: state:read (load current state), state:write (persist on Save).
 * Projects list is passed in as prop (from the caller which already has the list).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { Checkbox } from '../../components/ui/Checkbox'
import type { LaunchGroup, ProjectInfo, AppState } from '../../../core/models'

function cloneGroups(groups: LaunchGroup[]): LaunchGroup[] {
  return groups.map((g) => ({ name: g.name, projectPaths: [...g.projectPaths] }))
}

function nextGroupName(groups: LaunchGroup[]): string {
  const base = 'New group'
  if (!groups.some((g) => g.name === base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!groups.some((g) => g.name === candidate)) return candidate
  }
}

export interface GroupManagerDialogProps {
  open: boolean
  projects: ProjectInfo[]
  onClose: () => void
  onRefresh: () => void
}

export function GroupManagerDialog({
  open,
  projects,
  onClose,
  onRefresh,
}: GroupManagerDialogProps): React.ReactElement {
  const [groups, setGroups] = useState<LaunchGroup[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)

  const current: LaunchGroup | null =
    selectedIndex !== null ? (groups[selectedIndex] ?? null) : null

  // Load state on open
  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)

    void window.ccmc.invoke('state:read').then((state) => {
      setAppState(state)
      const cloned = cloneGroups(state.groups ?? [])
      setGroups(cloned)
      setSelectedIndex(cloned.length > 0 ? 0 : null)
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [open])

  function handleAdd(): void {
    const newGroup: LaunchGroup = { name: nextGroupName(groups), projectPaths: [] }
    const next = [...groups, newGroup]
    setGroups(next)
    setSelectedIndex(next.length - 1)
  }

  function handleRemove(): void {
    if (selectedIndex === null) return
    const next = groups.filter((_, i) => i !== selectedIndex)
    setGroups(next)
    const newSel = next.length === 0 ? null : Math.min(selectedIndex, next.length - 1)
    setSelectedIndex(newSel)
  }

  function handleNameChange(name: string): void {
    if (selectedIndex === null) return
    setGroups((prev) =>
      prev.map((g, i) => i === selectedIndex ? { ...g, name } : g),
    )
  }

  function handleProjectToggle(path: string, checked: boolean): void {
    if (selectedIndex === null) return
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== selectedIndex) return g
        const lower = path.toLowerCase()
        if (checked) {
          if (!g.projectPaths.some((p) => p.toLowerCase() === lower)) {
            return { ...g, projectPaths: [...g.projectPaths, path] }
          }
          return g
        } else {
          return { ...g, projectPaths: g.projectPaths.filter((p) => p.toLowerCase() !== lower) }
        }
      }),
    )
  }

  async function handleSave(): Promise<void> {
    if (saving || !appState) return
    setSaving(true)
    setError(null)
    try {
      const next: AppState = { ...appState, groups }
      await window.ccmc.invoke('state:write', next)
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={saving}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleSave()} disabled={saving || !appState}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )

  const currentPaths = new Set((current?.projectPaths ?? []).map((p) => p.toLowerCase()))

  return (
    <Modal open={open} title="Launch Groups" onClose={onClose} footer={footer}>
      <div className="flex gap-4 min-w-[480px] min-h-[300px]">
        {/* Left panel — group list */}
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
            aria-label="Groups"
            className="flex-1 border border-[var(--control-border)] rounded overflow-y-auto"
          >
            {groups.map((g, i) => (
              <div
                key={i}
                role="option"
                aria-selected={selectedIndex === i}
                onClick={() => setSelectedIndex(i)}
                className={[
                  'px-2 py-1.5 text-sm cursor-pointer truncate',
                  selectedIndex === i
                    ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                    : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                ].join(' ')}
                title={g.name}
              >
                {g.name || '(unnamed)'}
              </div>
            ))}
            {groups.length === 0 && (
              <p className="p-2 text-xs text-[var(--text-secondary)]">No groups</p>
            )}
          </div>
        </div>

        {/* Right panel — editor */}
        <div className="flex flex-col gap-3 flex-1">
          {current === null ? (
            <p className="text-sm text-[var(--text-secondary)]">Select or create a group.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Group name
                </label>
                <TextInput
                  value={current.name}
                  onChange={handleNameChange}
                  aria-label="Group name"
                  placeholder="Group name"
                />
              </div>

              <div className="flex flex-col gap-1 flex-1">
                <p className="text-xs font-medium text-[var(--text-secondary)]">Projects</p>
                <div className="border border-[var(--control-border)] rounded p-2 overflow-y-auto max-h-48 flex flex-col gap-1">
                  {projects.length === 0 && (
                    <p className="text-xs text-[var(--text-secondary)]">No projects available.</p>
                  )}
                  {projects.map((p) => (
                    <Checkbox
                      key={p.path}
                      checked={currentPaths.has(p.path.toLowerCase())}
                      onChange={(checked) => handleProjectToggle(p.path, checked)}
                      label={p.name}
                    />
                  ))}
                </div>
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
