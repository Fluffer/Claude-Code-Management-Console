import React, { useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { LaunchGroup, ProjectInfo, SavedFilter } from '../../../core/models'

interface CommandBarProps {
  anySessionRunning: boolean
  groups: LaunchGroup[]
  savedFilters: SavedFilter[]
  /** Recently launched projects, newest first. Drives the Recent dropdown. */
  recent: ProjectInfo[]
  onSelectRecent: (project: ProjectInfo) => void
  onNewProject: () => void
  onRefresh: () => void
  onStopAll: () => void
  onManageProfiles: () => void
  onLaunchGroup: (group: LaunchGroup) => void
  onManageGroups: () => void
  onSelectFilter: (filter: SavedFilter) => void
  onManageFilters: () => void
}

interface DropdownProps {
  label: string
  children: (close: () => void) => React.ReactNode
}

/** Small popover dropdown — button + click-away menu. Mirrors the WinUI DropDownButton. */
function Dropdown({ label, children }: DropdownProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const close = (): void => setOpen(false)
  return (
    <div className="relative">
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            role="menu"
            className="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] max-h-72 overflow-y-auto bg-[var(--surface)] border border-[var(--divider)] rounded-md shadow-lg py-1"
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  muted,
}: {
  label: string
  onClick: () => void
  muted?: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-1.5 text-sm rounded',
        'hover:bg-[var(--subtle-fill)] focus:outline-none focus:bg-[var(--subtle-fill)]',
        muted ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function MenuSeparator(): React.ReactElement {
  return <div className="my-1 h-px bg-[var(--divider)] mx-1" />
}

/**
 * Bottom action bar — mirrors WinUI Grid.Row="3" in the content area.
 *
 *   New Project → dialog action
 *   Refresh     → direct re-scan (ViewModel.RescanCommand)
 *   Profiles    → manage launch profiles (ManageProfiles_Click)
 *   Groups      → launch a saved group, or manage groups (GroupsButton)
 *   Filters     → select a saved filter, or manage filters (FiltersButton)
 *   Stop All    → visible only when anySessionRunning=true
 *
 * The Recent dropdown (RecentButton) lands in a follow-up batch once launch
 * usage recording feeds state.recentLaunches.
 */
export function CommandBar({
  anySessionRunning,
  groups,
  savedFilters,
  recent,
  onSelectRecent,
  onNewProject,
  onRefresh,
  onStopAll,
  onManageProfiles,
  onLaunchGroup,
  onManageGroups,
  onSelectFilter,
  onManageFilters,
}: CommandBarProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between pt-2 border-t border-[var(--divider)] flex-shrink-0">
      <div className="flex items-center gap-2">
        <Button onClick={onNewProject} aria-label="New Project">
          + New Project
        </Button>
        <Button onClick={onRefresh} aria-label="Refresh">
          ↻ Refresh
        </Button>
        <Button onClick={onManageProfiles} aria-label="Launch profiles">
          ☰ Profiles
        </Button>

        <Dropdown label="🕘 Recent">
          {(close) => (
            <>
              {recent.length === 0 && (
                <MenuItem label="No recent launches" onClick={close} muted />
              )}
              {recent.map((p) => (
                <MenuItem
                  key={p.path}
                  label={p.name}
                  onClick={() => {
                    close()
                    onSelectRecent(p)
                  }}
                />
              ))}
            </>
          )}
        </Dropdown>

        <Dropdown label="⛁ Groups">
          {(close) => (
            <>
              {groups.length === 0 && (
                <MenuItem label="No groups yet" onClick={close} muted />
              )}
              {groups.map((g) => (
                <MenuItem
                  key={g.name}
                  label={`▶ ${g.name} (${g.projectPaths.length})`}
                  onClick={() => {
                    close()
                    onLaunchGroup(g)
                  }}
                />
              ))}
              <MenuSeparator />
              <MenuItem
                label="Manage groups…"
                onClick={() => {
                  close()
                  onManageGroups()
                }}
              />
            </>
          )}
        </Dropdown>

        <Dropdown label="🔎 Filters">
          {(close) => (
            <>
              {savedFilters.length === 0 && (
                <MenuItem label="No saved filters yet" onClick={close} muted />
              )}
              {savedFilters.map((f) => (
                <MenuItem
                  key={f.name}
                  label={f.name}
                  onClick={() => {
                    close()
                    onSelectFilter(f)
                  }}
                />
              ))}
              <MenuSeparator />
              <MenuItem
                label="Manage filters…"
                onClick={() => {
                  close()
                  onManageFilters()
                }}
              />
            </>
          )}
        </Dropdown>
      </div>
      {anySessionRunning && (
        <Button variant="subtle" onClick={onStopAll} aria-label="Stop all sessions">
          ■ Stop all
        </Button>
      )}
    </div>
  )
}
