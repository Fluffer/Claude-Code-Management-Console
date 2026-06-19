import React from 'react'
import type { ProjectInfo } from '../../../core/models'
import type { ProjectAction } from './projectActions'

interface ContextMenuProps {
  project: ProjectInfo
  isOpen: boolean
  onClose: () => void
  onAction: (action: ProjectAction) => void
}

interface MenuItemProps {
  label: string
  onClick: () => void
  danger?: boolean
}

function MenuItem({ label, onClick, danger }: MenuItemProps): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-1.5 text-sm rounded',
        'hover:bg-[var(--subtle-fill)] focus:outline-none focus:bg-[var(--subtle-fill)]',
        danger ? 'text-red-500' : 'text-[var(--text-primary)]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function Separator(): React.ReactElement {
  return <div className="my-1 h-px bg-[var(--divider)] mx-1" />
}

/**
 * Context menu for a project row.
 * Maps to the MenuFlyout in MainWindow.xaml (row context menu).
 *
 * All 21 actions from the XAML are present.
 * Routing:
 *   pin-toggle, copy-path, copy-deep-link, open-folder, open-vscode,
 *   stop-session → App dispatcher handles inline (direct IPC or state op).
 *   rename, move-to-root, apply-profile, hide, delete, edit-env,
 *   open-claude-md, open-settings-json, open-claudeignore, view-mcp,
 *   launch-quick-prompt, launch-worktree, resume-session → forwarded to
 *   onAction for dialog batches 4M/4N to implement.
 */
export function ContextMenu({
  project,
  isOpen,
  onClose,
  onAction,
}: ContextMenuProps): React.ReactElement | null {
  if (!isOpen) return null

  function dispatch(action: ProjectAction): void {
    onAction(action)
    onClose()
  }

  return (
    <div
      role="menu"
      aria-label={`Actions for ${project.name}`}
      className="min-w-[210px] bg-[var(--surface)] border border-[var(--divider)] rounded-md shadow-lg py-1"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Open / file actions */}
      <MenuItem label="Open in Explorer"    onClick={() => dispatch({ kind: 'open-folder', project })} />
      <MenuItem label="Open in VS Code"     onClick={() => dispatch({ kind: 'open-vscode', project })} />
      <MenuItem label="Open CLAUDE.md"      onClick={() => dispatch({ kind: 'open-claude-md', project })} />
      <MenuItem label="Open settings.json"  onClick={() => dispatch({ kind: 'open-settings-json', project })} />
      <MenuItem label="View MCP servers…"   onClick={() => dispatch({ kind: 'view-mcp', project })} />
      <MenuItem label="Copy path"           onClick={() => dispatch({ kind: 'copy-path', project })} />
      <MenuItem label="Copy deep link"      onClick={() => dispatch({ kind: 'copy-deep-link', project })} />

      <Separator />

      {/* Rename / move / profile */}
      <MenuItem label="Rename…"             onClick={() => dispatch({ kind: 'rename', project })} />
      <MenuItem label="Move to root"        onClick={() => dispatch({ kind: 'move-to-root', project })} />
      <MenuItem label="Apply profile"       onClick={() => dispatch({ kind: 'apply-profile', project })} />

      <Separator />

      {/* Pin */}
      <MenuItem label="Pin / Unpin"         onClick={() => dispatch({ kind: 'pin-toggle', project })} />

      <Separator />

      {/* Session control */}
      <MenuItem label="Stop session"        onClick={() => dispatch({ kind: 'stop-session', project })} />

      <Separator />

      {/* Launch variants */}
      <MenuItem label="Quick prompt…"       onClick={() => dispatch({ kind: 'launch-quick-prompt', project })} />
      <MenuItem label="Launch in worktree…" onClick={() => dispatch({ kind: 'launch-worktree', project })} />
      <MenuItem label="Resume session…"     onClick={() => dispatch({ kind: 'resume-session', project })} />

      <Separator />

      {/* Project files */}
      <MenuItem label="Edit .env…"          onClick={() => dispatch({ kind: 'edit-env', project })} />
      <MenuItem label="Open .claudeignore"  onClick={() => dispatch({ kind: 'open-claudeignore', project })} />

      <Separator />

      {/* Destructive */}
      <MenuItem label="Hide from console"   onClick={() => dispatch({ kind: 'hide', project })} />
      <MenuItem label="Delete from disk…"   onClick={() => dispatch({ kind: 'delete', project })} danger />
    </div>
  )
}
