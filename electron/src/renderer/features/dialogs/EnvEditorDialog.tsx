/**
 * EnvEditorDialog — ports EnvEditorDialog.xaml + .xaml.cs.
 *
 * Structured editor for a project's .env file. Values masked by default
 * (type="password"); a per-row reveal toggle is transient.
 *
 * On Save: folds edits back over the original text using core envFileEditor
 * SetKey/RemoveKey so comments and line order survive.
 *
 * IPC: env:read (load), env:write (save).
 * .env contents are never logged.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { IconButton } from '../../components/ui/IconButton'
import { parse, setKey, removeKey } from '../../../core/config/envFileEditor'
import type { ProjectInfo } from '../../../core/models'

interface EnvRow {
  key: string
  value: string
  revealed: boolean
}

export interface EnvEditorDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
  onRefresh: () => void
}

export function EnvEditorDialog({
  open,
  project,
  onClose,
  onRefresh,
}: EnvEditorDialogProps): React.ReactElement {
  const [originalText, setOriginalText] = useState('')
  const [rows, setRows] = useState<EnvRow[]>([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load .env on open
  useEffect(() => {
    if (!open) return
    setRows([])
    setNewKey('')
    setNewValue('')
    setError(null)
    setLoading(true)

    void window.ccmc.invoke('env:read', { path: project.path }).then((text) => {
      setOriginalText(text)
      const entries = parse(text)
      setRows(entries.map((e) => ({ key: e.key, value: e.value, revealed: false })))
      setLoading(false)
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })
  }, [open, project.path])

  function handleAddRow(): void {
    const k = newKey.trim()
    if (!k) return
    setRows((prev) => {
      const existing = prev.findIndex((r) => r.key === k)
      if (existing !== -1) {
        return prev.map((r, i) => i === existing ? { ...r, value: newValue } : r)
      }
      return [...prev, { key: k, value: newValue, revealed: false }]
    })
    setNewKey('')
    setNewValue('')
  }

  function handleRemoveRow(key: string): void {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function handleRevealToggle(key: string): void {
    setRows((prev) =>
      prev.map((r) => r.key === key ? { ...r, revealed: !r.revealed } : r),
    )
  }

  function handleValueChange(key: string, value: string): void {
    setRows((prev) =>
      prev.map((r) => r.key === key ? { ...r, value } : r),
    )
  }

  async function handleSave(): Promise<void> {
    if (saving) return
    setSaving(true)
    setError(null)

    try {
      // Drop keys the user removed (present originally, gone from edited rows)
      const keptKeys = new Set(rows.map((r) => r.key))
      const originalEntries = parse(originalText)
      let text = originalText
      for (const entry of originalEntries) {
        if (!keptKeys.has(entry.key)) {
          text = removeKey(text, entry.key)
        }
      }
      // Update/append surviving rows in order
      for (const row of rows) {
        text = setKey(text, row.key, row.value)
      }

      await window.ccmc.invoke('env:write', { path: project.path, contents: text })
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
      <Button
        variant="accent"
        onClick={() => void handleSave()}
        disabled={loading || saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title={`.env — ${project.name}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        {loading && (
          <p className="text-xs text-[var(--text-secondary)]">Loading…</p>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-xs text-[var(--text-secondary)]">No keys defined yet.</p>
        )}

        {/* Existing rows */}
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-32 text-sm font-mono text-[var(--text-primary)] truncate shrink-0" title={row.key}>
              {row.key}
            </span>
            <input
              type={row.revealed ? 'text' : 'password'}
              value={row.value}
              aria-label={`Value for ${row.key}`}
              onChange={(e) => handleValueChange(row.key, e.target.value)}
              className={[
                'flex-1 rounded px-3 py-1.5 text-sm font-mono',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)] focus:border-transparent',
              ].join(' ')}
            />
            <IconButton
              aria-label={row.revealed ? `Hide ${row.key}` : `Reveal ${row.key}`}
              onClick={() => handleRevealToggle(row.key)}
              title={row.revealed ? 'Hide value' : 'Reveal value'}
            >
              {row.revealed ? '🙈' : '👁'}
            </IconButton>
            <IconButton
              aria-label={`Remove ${row.key}`}
              onClick={() => handleRemoveRow(row.key)}
              title="Remove key"
            >
              ✕
            </IconButton>
          </div>
        ))}

        {/* Add new key row */}
        <div className="border-t border-[var(--divider)] pt-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--text-secondary)]">Add / update key</p>
          <div className="flex gap-2">
            <TextInput
              value={newKey}
              onChange={setNewKey}
              placeholder="KEY"
              aria-label="New key name"
              className="w-32 shrink-0 font-mono"
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="value"
              aria-label="New key value"
              className={[
                'flex-1 rounded px-3 py-1.5 text-sm font-mono',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)] focus:border-transparent',
              ].join(' ')}
            />
            <Button onClick={handleAddRow} disabled={!newKey.trim()}>
              Add
            </Button>
          </div>
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
