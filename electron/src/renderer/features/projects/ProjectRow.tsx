import React, { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { formatRelativeTime } from '../../../core/util/relativeTimeFormatter'
import { currentModel } from '../../../core/config/flagsEditor'
import type { ProjectInfo } from '../../../core/models'
import type { ProjectAction } from './projectActions'

/**
 * Async-loaded data filled in after initial render.
 * Mirrors MainViewModel.StartEnrichment: rows render instantly, then session/git
 * info fills in async. Null until first enrichment pass completes.
 */
export interface ProjectEnrichment {
  gitBranch: string | null
  gitDirty: boolean | null
  hasClaudeMd: boolean
  hasMcp: boolean
  hasSettingsError: boolean
  settingsError: string
  hasSession: boolean
  isStale: boolean
  /** Effective default model from settings.json; null when none set. */
  defaultModel: string | null
}

interface BadgeProps {
  children: React.ReactNode
  color?: 'accent' | 'success' | 'caution' | 'subtle'
  title?: string
}

function Badge({ children, color = 'accent', title }: BadgeProps): React.ReactElement {
  const colorClass: Record<string, string> = {
    accent: 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]',
    success: 'bg-green-600 text-white',
    caution: 'bg-yellow-500 text-white',
    subtle: 'bg-[var(--subtle-fill)] text-[var(--text-tertiary)]',
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${colorClass[color]}`}
    >
      {children}
    </span>
  )
}

interface ProjectRowProps {
  project: ProjectInfo
  isRunning: boolean
  isPinned: boolean
  enrichment: ProjectEnrichment | null
  onAction: (action: ProjectAction) => void
}

/** The four model choices in the per-row picker. null === "Default" (Claude's own choice). */
const MODEL_CHOICES: ReadonlyArray<{ label: string; value: string | null }> = [
  { label: 'Default', value: null },
  { label: 'sonnet', value: 'sonnet' },
  { label: 'opus', value: 'opus' },
  { label: 'haiku', value: 'haiku' },
]

/**
 * Per-row model picker — mirrors the DropDownButton in MainWindow.xaml.
 * Button label = explicit --model override ?? settings.json default ?? "Default".
 * Selecting writes --model into the project's saved flags (set-model action).
 */
function ModelPicker({
  project,
  enrichment,
  onAction,
}: Pick<ProjectRowProps, 'project' | 'enrichment' | 'onAction'>): React.ReactElement {
  const [open, setOpen] = useState(false)
  const override = currentModel(project.flags)
  const label = override ?? enrichment?.defaultModel ?? 'Default'

  return (
    <div className="relative">
      <Button
        variant="default"
        className="px-2.5 py-1 text-xs"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose the Claude model for this project (writes --model into its flags)"
      >
        {label} ▾
      </Button>
      {open && (
        <>
          {/* click-away catcher */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1 z-50 min-w-[120px] bg-[var(--surface)] border border-[var(--divider)] rounded-md shadow-lg py-1"
          >
            {MODEL_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onAction({ kind: 'set-model', project, model: choice.value })
                }}
                className={[
                  'w-full text-left px-3 py-1.5 text-xs rounded',
                  'hover:bg-[var(--subtle-fill)] focus:outline-none focus:bg-[var(--subtle-fill)]',
                  choice.value === override ? 'text-[var(--accent-fill)] font-semibold' : 'text-[var(--text-primary)]',
                ].join(' ')}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function leafName(root: string): string {
  const t = root.replace(/[/\\]+$/, '')
  const idx = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
  return idx >= 0 ? t.slice(idx + 1) : t
}

/**
 * ProjectRow — one row in the project list.
 *
 * Mirrors the DataTemplate in MainWindow.xaml + ProjectItemViewModel display props:
 *   - Name, path tooltip, root badge (leaf name)
 *   - "● live" badge (IsRunning)
 *   - "stale" badge (IsStale — enrichment)
 *   - ⎇ branch + dirty dot (GitBranch / GitDirty — enrichment)
 *   - CLAUDE.md badge (HasClaudeMd — enrichment)
 *   - MCP badge (HasMcp — enrichment)
 *   - ⚠ settings.json badge (HasSettingsError — enrichment)
 *   - LastUsedText (formatRelativeTime — now passed at call site, not inside core)
 *   - Description (second line, truncated)
 *   - Pin button (star, opacity fade)
 *   - New / Continue launch buttons
 *
 * `now` is created at the call site (new Date()) so RelativeTimeFormatter
 * receives a consistent snapshot for the current render cycle.
 */
export function ProjectRow({
  project,
  isRunning,
  isPinned,
  enrichment,
  onAction,
}: ProjectRowProps): React.ReactElement {
  // Create now at the call site — NOT inside the core formatter
  const now = new Date()
  const lastUsed = project.lastUsedUtc
    ? formatRelativeTime(new Date(project.lastUsedUtc), now)
    : ''

  const rootName = leafName(project.root)
  const hasSession = enrichment?.hasSession ?? true // default true until enrichment completes

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--subtle-fill)] rounded group">
      {/* Pin button — FavoriteStar / FavoriteStarFill glyph analog */}
      <button
        type="button"
        aria-label={isPinned ? 'Unpin project' : 'Pin project'}
        onClick={() => onAction({ kind: 'pin-toggle', project })}
        className={[
          'w-7 h-7 flex-shrink-0 flex items-center justify-center rounded text-sm',
          'bg-transparent border-none transition-opacity cursor-pointer',
          isPinned
            ? 'text-[var(--accent-fill)] opacity-100'
            : 'text-[var(--text-tertiary)] opacity-0 group-hover:opacity-55',
        ].join(' ')}
      >
        {isPinned ? '★' : '☆'}
      </button>

      {/* Name + badges + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="font-semibold text-sm text-[var(--text-primary)]"
            title={project.path}
          >
            {project.name}
          </span>

          <Badge color="accent" title={project.root}>
            {rootName}
          </Badge>

          {isRunning && (
            <Badge
              color="success"
              title="A Claude session is running in this folder right now"
            >
              ● live
            </Badge>
          )}

          {enrichment?.isStale && (
            <Badge color="subtle" title="No session activity in over a week.">
              stale
            </Badge>
          )}

          {enrichment?.gitBranch && (
            <span
              className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]"
              title={
                enrichment.gitDirty
                  ? `Git branch '${enrichment.gitBranch}' — has uncommitted changes`
                  : `Git branch '${enrichment.gitBranch}' — working tree clean`
              }
            >
              ⎇ {enrichment.gitBranch}
              {enrichment.gitDirty && (
                <span className="text-yellow-500">●</span>
              )}
            </span>
          )}

          {enrichment?.hasClaudeMd && (
            <Badge
              color="caution"
              title="This project has a CLAUDE.md (Claude project guidance). Right-click to open it."
            >
              CLAUDE.md
            </Badge>
          )}

          {enrichment?.hasMcp && (
            <Badge
              color="success"
              title="This project has a .mcp.json (MCP servers). Right-click to view them."
            >
              MCP
            </Badge>
          )}

          {enrichment?.hasSettingsError && (
            <Badge color="caution" title={enrichment.settingsError}>
              ⚠ settings.json
            </Badge>
          )}

          {lastUsed && (
            <span
              data-testid="last-used"
              className="text-[11px] text-[var(--text-tertiary)]"
              title="When you last launched a Claude session here from this app"
            >
              {lastUsed}
            </span>
          )}
        </div>

        {project.description && (
          <p
            className="text-xs text-[var(--text-secondary)] truncate mt-0.5"
            title={project.description}
          >
            {project.description}
          </p>
        )}
      </div>

      {/* Launch buttons — Model picker + New + Continue + Resume */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ModelPicker project={project} enrichment={enrichment} onAction={onAction} />
        <Button
          variant="default"
          className="px-3 py-1 text-xs"
          onClick={() => onAction({ kind: 'launch-new', project })}
          aria-label="New"
        >
          New
        </Button>
        <Button
          variant="accent"
          className="px-3 py-1 text-xs"
          disabled={!hasSession}
          onClick={() => onAction({ kind: 'launch-continue', project })}
          aria-label="Continue"
          title={
            !hasSession
              ? 'No previous Claude session was found for this folder — use New to start one'
              : 'Resume the most recent Claude session in this project (claude --continue)'
          }
        >
          Continue
        </Button>
        {hasSession && (
          <Button
            variant="default"
            className="px-2 py-1 text-xs"
            onClick={() => onAction({ kind: 'resume-session', project })}
            aria-label="Resume a past session"
            title="Pick a specific past Claude session to resume (claude --resume)"
          >
            ⟲
          </Button>
        )}
      </div>
    </div>
  )
}
