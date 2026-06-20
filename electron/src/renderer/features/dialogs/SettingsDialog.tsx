/**
 * SettingsDialog — ports SettingsDialog.xaml + .xaml.cs.
 *
 * App settings:
 *   - Appearance: theme (System/Light/Dark/High Contrast), accent, font
 *   - Source roots: list with Add (dialog:pickFolder) / Remove
 *   - Default root for new projects (combo)
 *   - Close to tray toggle
 *   - Hidden projects: list with Restore button
 *
 * IPC: state:read + config:read (load), state:write + config:write (save).
 * Theme changes apply immediately via useTheme().
 * Accent/font changes apply immediately via applyAccent/applyFont (live preview).
 * On Cancel, the persisted accent/font are re-applied to revert any un-saved preview.
 */
import React, { useState, useEffect } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { ToggleSwitch } from '../../components/ui/ToggleSwitch'
import { useTheme, type AppTheme } from '../../theme/ThemeProvider'
import { applyAccent, applyFont } from '../../theme/applyAppearance'
import { ACCENTS } from '../../../core/theme/accents'
import { FONTS } from '../../../core/theme/fonts'
import type { AppState, LauncherConfig } from '../../../core/models'

const THEME_OPTIONS = ['System', 'Light', 'Dark', 'High Contrast'] as const
type ThemeOption = typeof THEME_OPTIONS[number]

function appThemeFromOption(option: ThemeOption): AppTheme {
  if (option === 'Dark') return 'dark'
  if (option === 'High Contrast') return 'high-contrast'
  if (option === 'Light') return 'light'
  // "System" — detect from OS
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function themeOptionFromState(stateTheme: string): ThemeOption {
  if (stateTheme === 'Dark') return 'Dark'
  if (stateTheme === 'Light') return 'Light'
  if (stateTheme === 'HighContrast' || stateTheme === 'High Contrast') return 'High Contrast'
  return 'System'
}

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  onRefresh: () => void
}

export function SettingsDialog({
  open,
  onClose,
  onRefresh,
}: SettingsDialogProps): React.ReactElement {
  const { setTheme } = useTheme()

  const [appState, setAppState] = useState<AppState | null>(null)
  const [config, setConfig] = useState<LauncherConfig | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('System')
  const [selectedAccent, setSelectedAccent] = useState('default')
  const [selectedFont, setSelectedFont] = useState('default')
  const [closeToTray, setCloseToTray] = useState(false)
  const [roots, setRoots] = useState<string[]>([])
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const [selectedRoot, setSelectedRootSel] = useState<string | null>(null)
  const [selectedHidden, setSelectedHidden] = useState<string | null>(null)
  const [terminals, setTerminals] = useState<{ id: string; name: string; path: string }[]>([])
  const [terminalId, setTerminalId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load on open
  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setSelectedRootSel(null)
    setSelectedHidden(null)

    Promise.all([
      window.ccmc.invoke('state:read'),
      window.ccmc.invoke('config:read'),
      window.ccmc.invoke('terminals:detect'),
    ]).then(([state, cfg, detected]) => {
      setAppState(state)
      setConfig(cfg)
      setSelectedTheme(themeOptionFromState(state.theme))
      setCloseToTray(state.closeToTray)
      setTerminals(detected)
      setTerminalId(state.terminalId ?? '')
      const accentId = ACCENTS.some((a) => a.id === state.accent) ? state.accent : 'default'
      const fontId = FONTS.some((f) => f.id === state.font) ? state.font : 'default'
      setSelectedAccent(accentId)
      setSelectedFont(fontId)
      const r = cfg.roots ?? []
      setRoots(r)
      setDefaultRoot(cfg.defaultRoot ?? null)
      setHidden(cfg.hidden ?? [])
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [open])

  function handleThemeChange(option: ThemeOption): void {
    setSelectedTheme(option)
    setTheme(appThemeFromOption(option))
  }

  function handleAccentChange(id: string): void {
    setSelectedAccent(id)
    applyAccent(id)
  }

  function handleFontChange(id: string): void {
    setSelectedFont(id)
    applyFont(id)
  }

  function handleClose(): void {
    if (appState) {
      const accentId = ACCENTS.some((a) => a.id === appState.accent) ? appState.accent : 'default'
      const fontId = FONTS.some((f) => f.id === appState.font) ? appState.font : 'default'
      applyAccent(accentId)
      applyFont(fontId)
      // Theme also previews live (via setTheme) — revert it to the persisted value too,
      // otherwise an un-saved theme preview sticks after Cancel.
      setTheme(appThemeFromOption(themeOptionFromState(appState.theme)))
    }
    onClose()
  }

  async function handleAddRoot(): Promise<void> {
    try {
      const result = await window.ccmc.invoke('dialog:pickFolder', { title: 'Select source root' })
      if (result.path) {
        const newRoot = result.path
        setRoots((prev) => (prev.includes(newRoot) ? prev : [...prev, newRoot]))
        if (!defaultRoot) setDefaultRoot(newRoot)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleRemoveRoot(): void {
    if (!selectedRoot) return
    setRoots((prev) => prev.filter((r) => r !== selectedRoot))
    if (defaultRoot === selectedRoot) {
      setDefaultRoot(null)
    }
    setSelectedRootSel(null)
  }

  function handleRestoreHidden(): void {
    if (!selectedHidden) return
    setHidden((prev) => prev.filter((h) => h !== selectedHidden))
    setSelectedHidden(null)
  }

  async function handleSave(): Promise<void> {
    if (saving || !appState || !config) return
    setSaving(true)
    setError(null)

    try {
      const themeValue: string =
        selectedTheme === 'High Contrast' ? 'HighContrast' : selectedTheme

      const nextState: AppState = {
        ...appState,
        theme: themeValue,
        closeToTray,
        terminalId,
        accent: selectedAccent,
        font: selectedFont,
      }
      const nextConfig: LauncherConfig = {
        ...config,
        roots,
        defaultRoot,
        hidden,
      }

      await Promise.all([
        window.ccmc.invoke('state:write', nextState),
        window.ccmc.invoke('config:write', nextConfig),
      ])
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const footer = (
    <>
      <Button onClick={handleClose} variant="subtle" disabled={saving}>
        Cancel
      </Button>
      <Button variant="accent" onClick={() => void handleSave()} disabled={saving || !appState}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )

  return (
    <Modal open={open} title="Settings" onClose={handleClose} footer={footer}>
      <div className="flex flex-col gap-4 min-w-[420px]">

        {/* Appearance */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Appearance</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-secondary)] w-20 shrink-0" htmlFor="settings-theme">
              Theme
            </label>
            <select
              id="settings-theme"
              aria-label="Theme"
              value={selectedTheme}
              onChange={(e) => handleThemeChange(e.target.value as ThemeOption)}
              className={[
                'flex-1 rounded px-2 py-1.5 text-sm',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
              ].join(' ')}
            >
              {THEME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-secondary)] w-20 shrink-0" htmlFor="settings-terminal">
              Terminal
            </label>
            <select
              id="settings-terminal"
              aria-label="Open sessions in"
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className={[
                'flex-1 rounded px-2 py-1.5 text-sm',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
              ].join(' ')}
            >
              <option value="">Auto (Windows Terminal, else shell)</option>
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-secondary)] w-20 shrink-0" htmlFor="settings-accent">
              Accent
            </label>
            <select
              id="settings-accent"
              aria-label="Accent color"
              value={selectedAccent}
              onChange={(e) => handleAccentChange(e.target.value)}
              className={[
                'flex-1 rounded px-2 py-1.5 text-sm',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
              ].join(' ')}
            >
              {ACCENTS.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-secondary)] w-20 shrink-0" htmlFor="settings-font">
              Font
            </label>
            <select
              id="settings-font"
              aria-label="UI font"
              value={selectedFont}
              onChange={(e) => handleFontChange(e.target.value)}
              className={[
                'flex-1 rounded px-2 py-1.5 text-sm',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
              ].join(' ')}
            >
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Source roots */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Source roots</h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Folders scanned for projects. Each direct subfolder is one project.
          </p>
          <div className="flex gap-3">
            <div className="flex-1 border border-[var(--control-border)] rounded overflow-y-auto max-h-32">
              {roots.length === 0 && (
                <p className="p-2 text-xs text-[var(--text-secondary)]">No roots configured.</p>
              )}
              {roots.map((r) => (
                <div
                  key={r}
                  role="option"
                  aria-selected={selectedRoot === r}
                  onClick={() => setSelectedRootSel((prev) => prev === r ? null : r)}
                  className={[
                    'px-2 py-1.5 text-sm cursor-pointer truncate',
                    selectedRoot === r
                      ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                      : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                  ].join(' ')}
                  title={r}
                >
                  {r}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => void handleAddRoot()}>
                Add…
              </Button>
              <Button
                onClick={handleRemoveRoot}
                variant="subtle"
                disabled={!selectedRoot}
              >
                Remove
              </Button>
            </div>
          </div>
        </section>

        {/* Default root */}
        {roots.length > 0 && (
          <section className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-[var(--text-primary)]" htmlFor="settings-default-root">
              Default root for new projects
            </label>
            <select
              id="settings-default-root"
              aria-label="Default root"
              value={defaultRoot ?? ''}
              onChange={(e) => setDefaultRoot(e.target.value || null)}
              className={[
                'rounded px-2 py-1.5 text-sm',
                'bg-[var(--control-fill)] border border-[var(--control-border)]',
                'text-[var(--text-primary)]',
                'focus:outline focus:outline-2 focus:outline-[var(--accent)]',
              ].join(' ')}
            >
              <option value="">(none)</option>
              {roots.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </section>
        )}

        {/* Close to tray */}
        <ToggleSwitch
          checked={closeToTray}
          onChange={setCloseToTray}
          label="Close to tray"
        />

        {/* Hidden projects */}
        {hidden.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Hidden projects</h3>
            <div className="flex gap-3">
              <div className="flex-1 border border-[var(--control-border)] rounded overflow-y-auto max-h-28">
                {hidden.map((h) => (
                  <div
                    key={h}
                    role="option"
                    aria-selected={selectedHidden === h}
                    onClick={() => setSelectedHidden((prev) => prev === h ? null : h)}
                    className={[
                      'px-2 py-1.5 text-sm cursor-pointer truncate',
                      selectedHidden === h
                        ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                        : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                    ].join(' ')}
                    title={h}
                  >
                    {h}
                  </div>
                ))}
              </div>
              <Button
                onClick={handleRestoreHidden}
                variant="subtle"
                disabled={!selectedHidden}
              >
                Restore
              </Button>
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
