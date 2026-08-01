/**
 * ApplyProfileDialog — picks one saved LaunchProfile and writes its composed
 * flags into the project's saved flags in config.json.
 *
 * This is the half of "launch profiles" that ProfileManagerDialog does not do:
 * the manager creates/edits/persists profiles in state.json, this applies one to
 * a project. Same write path as the per-row model picker (set-model), which is
 * the narrow special case of this — profiles generalize it to permission-mode
 * and tool allowlists.
 *
 * Stays launcher-side: composed flags become CLI arguments on the next launch,
 * never a write to the user's real .claude/settings.json.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { composeProfile } from '../../../core/launch/profileComposer'
import type { LaunchProfile, ProjectInfo } from '../../../core/models'

export interface ApplyProfileDialogProps {
  open: boolean
  project: ProjectInfo
  onClose: () => void
  onRefresh: () => void
}

/**
 * composeProfile throws on a token that would be unsafe as a launcher flag
 * (spaces, shell metacharacters). A profile can only reach that state by being
 * hand-edited into state.json, but the preview must not take the dialog down.
 */
function safeCompose(profile: LaunchProfile): { flags: string; error: string | null } {
  try {
    return { flags: composeProfile(profile), error: null }
  } catch (err) {
    return { flags: '', error: err instanceof Error ? err.message : String(err) }
  }
}

export function ApplyProfileDialog({
  open,
  project,
  onClose,
  onRefresh,
}: ApplyProfileDialogProps): React.ReactElement {
  const [profiles, setProfiles] = useState<LaunchProfile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [currentFlags, setCurrentFlags] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setError(null)
    setApplying(false)
    setLoading(true)
    void Promise.all([window.ccmc.invoke('state:read'), window.ccmc.invoke('config:read')])
      .then(([state, cfg]) => {
        setProfiles(state.profiles ?? [])
        setCurrentFlags(cfg.projects?.[project.path]?.flags ?? '')
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [open, project.path])

  const chosen = profiles.find((p) => p.name === selected) ?? null
  const composed = chosen ? safeCompose(chosen) : null

  async function handleApply(): Promise<void> {
    if (!chosen || applying) return
    const result = safeCompose(chosen)
    if (result.error !== null) {
      setError(result.error)
      return
    }
    setApplying(true)
    setError(null)
    try {
      // Re-read rather than reusing the mount-time copy: the dialog may have
      // been open while something else wrote config (a launch stamps lastUsed).
      const cfg = await window.ccmc.invoke('config:read')
      const projects = cfg.projects ?? {}
      const usage = projects[project.path] ?? { lastUsed: null, flags: '' }
      await window.ccmc.invoke('config:write', {
        ...cfg,
        projects: {
          ...projects,
          [project.path]: { ...usage, flags: result.flags },
        },
      })
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setApplying(false)
    }
  }

  const footer = (
    <>
      <Button onClick={onClose} variant="subtle" disabled={applying}>
        Cancel
      </Button>
      <Button
        variant="accent"
        onClick={() => void handleApply()}
        disabled={!chosen || composed?.error !== null || applying}
      >
        {applying ? 'Applying…' : 'Apply'}
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      title={`Apply profile to "${project.name}"`}
      onClose={onClose}
      footer={footer}
    >
      <div className="flex flex-col gap-3 min-w-[420px]">
        {loading && <p className="text-xs text-[var(--text-secondary)]">Loading profiles…</p>}

        {!loading && profiles.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No profiles saved yet. Create one with Profiles… in the sidebar.
          </p>
        )}

        {!loading && profiles.length > 0 && (
          <>
            <div
              role="listbox"
              aria-label="Profile"
              className="flex flex-col border border-[var(--control-border)] rounded overflow-y-auto max-h-48"
            >
              {profiles.map((profile) => {
                const isSelected = selected === profile.name
                const preview = safeCompose(profile)
                return (
                  <div
                    key={profile.name}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => setSelected(profile.name)}
                    className={[
                      'px-3 py-2 cursor-pointer text-sm',
                      isSelected
                        ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                        : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                    ].join(' ')}
                  >
                    <div className="truncate">{profile.name}</div>
                    <div
                      className={[
                        'text-xs truncate font-mono',
                        isSelected ? 'opacity-80' : 'text-[var(--text-secondary)]',
                      ].join(' ')}
                    >
                      {preview.error !== null
                        ? 'unusable — ' + preview.error
                        : preview.flags || '(no flags)'}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Applying replaces saved flags outright rather than merging, so
                show what is about to be lost. */}
            <p className="text-xs text-[var(--text-secondary)]">
              Replaces this project&apos;s saved flags:{' '}
              <span className="font-mono">{currentFlags || '(none)'}</span>
              {composed !== null && composed.error === null && (
                <>
                  {' → '}
                  <span className="font-mono">{composed.flags || '(none)'}</span>
                </>
              )}
            </p>
          </>
        )}

        {error !== null && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
