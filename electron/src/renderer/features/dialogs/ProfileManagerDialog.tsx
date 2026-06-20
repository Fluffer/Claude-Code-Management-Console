/**
 * ProfileManagerDialog — ports ProfileManagerDialog.xaml + .xaml.cs.
 *
 * Manage LaunchProfiles (flags via core flagsEditor/flagCatalog, model selection).
 * Persist to AppState via state:write.
 *
 * C# behavior:
 *   - ModelOptions: ["Default", "sonnet", "opus", "haiku"]
 *   - PermissionOptions: ["none", "default", "acceptEdits", "bypassPermissions", "plan"]
 *   - "Default" / "none" stored as null in the model
 *   - allowedTools / disallowedTools stored as space-separated in the TextBox, split on whitespace
 *   - Preview composed via core profileComposer
 *
 * IPC: state:read (load), state:write (save).
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextInput } from '../../components/ui/TextInput'
import { composeProfile } from '../../../core/launch/profileComposer'
import type { LaunchProfile, AppState } from '../../../core/models'

const MODEL_OPTIONS = ['Default', 'sonnet', 'opus', 'haiku'] as const
const PERMISSION_OPTIONS = ['none', 'default', 'acceptEdits', 'bypassPermissions', 'plan'] as const

function cloneProfiles(profiles: LaunchProfile[]): LaunchProfile[] {
  return profiles.map((p) => ({
    name: p.name,
    model: p.model,
    permissionMode: p.permissionMode,
    allowedTools: [...p.allowedTools],
    disallowedTools: [...p.disallowedTools],
  }))
}

function nextProfileName(profiles: LaunchProfile[]): string {
  const base = 'New profile'
  if (!profiles.some((p) => p.name === base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!profiles.some((p) => p.name === candidate)) return candidate
  }
}

function splitTokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}

function getPreview(profile: LaunchProfile | null): string {
  if (!profile) return ''
  try {
    return composeProfile(profile) || '(no flags)'
  } catch {
    return '(invalid flags)'
  }
}

export interface ProfileManagerDialogProps {
  open: boolean
  onClose: () => void
  onRefresh: () => void
}

export function ProfileManagerDialog({
  open,
  onClose,
  onRefresh,
}: ProfileManagerDialogProps): React.ReactElement {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appState, setAppState] = useState<AppState | null>(null)

  // Editor field state (synced from current profile)
  const [name, setName] = useState('')
  const [model, setModel] = useState<string>('Default')
  const [permMode, setPermMode] = useState<string>('none')
  const [allowedText, setAllowedText] = useState('')
  const [disallowedText, setDisallowedText] = useState('')

  const current: LaunchProfile | null =
    selectedIndex !== null ? (profiles[selectedIndex] ?? null) : null

  // Load state on open
  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)

    void window.ccmc.invoke('state:read').then((state) => {
      setAppState(state)
      const cloned = cloneProfiles(state.profiles ?? [])
      setProfiles(cloned)
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

  // Sync editor when selection changes
  function selectProfile(index: number | null): void {
    setSelectedIndex(index)
    if (index !== null && profiles[index]) {
      loadEditor(profiles[index])
    } else {
      clearEditor()
    }
  }

  function loadEditor(profile: LaunchProfile): void {
    setName(profile.name)
    setModel(!profile.model ? 'Default' : profile.model)
    setPermMode(!profile.permissionMode ? 'none' : profile.permissionMode)
    setAllowedText(profile.allowedTools.join(' '))
    setDisallowedText(profile.disallowedTools.join(' '))
  }

  function clearEditor(): void {
    setName('')
    setModel('Default')
    setPermMode('none')
    setAllowedText('')
    setDisallowedText('')
  }

  // Flush editor fields back to the current profile object
  function flushCurrentEditor(): void {
    if (selectedIndex === null) return
    setProfiles((prev) =>
      prev.map((p, i) =>
        i === selectedIndex
          ? {
              ...p,
              name,
              model: model === 'Default' ? null : model,
              permissionMode: permMode === 'none' ? null : permMode,
              allowedTools: splitTokens(allowedText),
              disallowedTools: splitTokens(disallowedText),
            }
          : p,
      ),
    )
  }

  function handleAdd(): void {
    // Flush current before adding
    flushCurrentEditor()
    const newProfile: LaunchProfile = {
      name: nextProfileName(profiles),
      model: null,
      permissionMode: null,
      allowedTools: [],
      disallowedTools: [],
    }
    setProfiles((prev) => {
      const next = [...prev, newProfile]
      return next
    })
    const newIndex = profiles.length
    setSelectedIndex(newIndex)
    loadEditor(newProfile)
  }

  function handleRemove(): void {
    if (selectedIndex === null) return
    const next = profiles.filter((_, i) => i !== selectedIndex)
    setProfiles(next)
    const newSel = next.length === 0 ? null : Math.min(selectedIndex, next.length - 1)
    setSelectedIndex(newSel)
    if (newSel !== null && next[newSel]) {
      loadEditor(next[newSel])
    } else {
      clearEditor()
    }
  }

  function handleSelectProfile(index: number): void {
    flushCurrentEditor()
    selectProfile(index)
  }

  // Build preview of current editor state
  const previewProfile: LaunchProfile | null = selectedIndex !== null
    ? {
        name,
        model: model === 'Default' ? null : model,
        permissionMode: permMode === 'none' ? null : permMode,
        allowedTools: splitTokens(allowedText),
        disallowedTools: splitTokens(disallowedText),
      }
    : null

  async function handleSave(): Promise<void> {
    if (saving || !appState) return
    // Flush editor fields into profiles array
    const flushed = profiles.map((p, i) =>
      i === selectedIndex
        ? {
            ...p,
            name,
            model: model === 'Default' ? null : model,
            permissionMode: permMode === 'none' ? null : permMode,
            allowedTools: splitTokens(allowedText),
            disallowedTools: splitTokens(disallowedText),
          }
        : p,
    )

    setSaving(true)
    setError(null)
    try {
      const next: AppState = { ...appState, profiles: flushed }
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

  return (
    <Modal open={open} title="Launch Profiles" onClose={onClose} footer={footer}>
      <div className="flex gap-4 min-w-[520px] min-h-[340px]">
        {/* Left panel — profile list */}
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
            aria-label="Profiles"
            className="flex-1 border border-[var(--control-border)] rounded overflow-y-auto"
          >
            {profiles.map((p, i) => (
              <div
                key={i}
                role="option"
                aria-selected={selectedIndex === i}
                onClick={() => handleSelectProfile(i)}
                className={[
                  'px-2 py-1.5 text-sm cursor-pointer truncate',
                  selectedIndex === i
                    ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                    : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                ].join(' ')}
                title={p.name}
              >
                {p.name || '(unnamed)'}
              </div>
            ))}
            {profiles.length === 0 && (
              <p className="p-2 text-xs text-[var(--text-secondary)]">No profiles</p>
            )}
          </div>
        </div>

        {/* Right panel — editor */}
        <div className="flex flex-col gap-3 flex-1">
          {current === null && selectedIndex === null ? (
            <p className="text-sm text-[var(--text-secondary)]">Select or create a profile.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="profile-name">
                  Profile name
                </label>
                <TextInput
                  id="profile-name"
                  value={name}
                  onChange={setName}
                  aria-label="Profile name"
                  placeholder="Profile name"
                  disabled={selectedIndex === null}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="profile-model">
                    Model
                  </label>
                  <select
                    id="profile-model"
                    aria-label="Model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={selectedIndex === null}
                    className={[
                      'rounded px-2 py-1.5 text-sm',
                      'bg-[var(--control-fill)] border border-[var(--control-border)]',
                      'text-[var(--text-primary)]',
                      'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
                      'disabled:opacity-40',
                    ].join(' ')}
                  >
                    {MODEL_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="profile-perm">
                    Permission mode
                  </label>
                  <select
                    id="profile-perm"
                    aria-label="Permission mode"
                    value={permMode}
                    onChange={(e) => setPermMode(e.target.value)}
                    disabled={selectedIndex === null}
                    className={[
                      'rounded px-2 py-1.5 text-sm',
                      'bg-[var(--control-fill)] border border-[var(--control-border)]',
                      'text-[var(--text-primary)]',
                      'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
                      'disabled:opacity-40',
                    ].join(' ')}
                  >
                    {PERMISSION_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="profile-allowed">
                  Allowed tools (space-separated)
                </label>
                <TextInput
                  id="profile-allowed"
                  value={allowedText}
                  onChange={setAllowedText}
                  aria-label="Allowed tools"
                  placeholder="Read Edit Bash"
                  disabled={selectedIndex === null}
                />
                <p className="text-xs text-[var(--text-secondary)] opacity-60">
                  Plain tool names only — e.g. Read Edit Bash
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="profile-disallowed">
                  Disallowed tools (space-separated)
                </label>
                <TextInput
                  id="profile-disallowed"
                  value={disallowedText}
                  onChange={setDisallowedText}
                  aria-label="Disallowed tools"
                  placeholder="Bash"
                  disabled={selectedIndex === null}
                />
              </div>

              {previewProfile && (
                <div className="border border-[var(--divider)] rounded p-2 bg-[var(--control-fill)]">
                  <p className="text-xs font-medium text-[var(--text-secondary)] mb-0.5">Preview</p>
                  <code className="text-xs text-[var(--text-primary)] font-mono break-all">
                    {getPreview(previewProfile)}
                  </code>
                </div>
              )}
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
