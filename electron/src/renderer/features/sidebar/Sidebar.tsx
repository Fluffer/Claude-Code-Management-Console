import React from 'react'
import { Button } from '../../components/ui/Button'
import type { SidebarEntry } from './sidebarItems'

interface SidebarProps {
  items: SidebarEntry[]
  selected: SidebarEntry | null
  onSelect: (entry: SidebarEntry) => void
  onSettingsClick: () => void
}

/**
 * Sidebar — SOURCE ROOTS + saved filters list.
 * Maps to WinUI sidebar: header "SOURCE ROOTS", ListView (SidebarList),
 * Settings + Help buttons at the bottom.
 * Selected entry drives the project list filter via parent state.
 */
export function Sidebar({
  items,
  selected,
  onSelect,
  onSettingsClick,
}: SidebarProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full gap-2">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-tertiary)] px-2 pt-1">
        Source Roots
      </p>

      <ul
        role="listbox"
        aria-label="Source roots and filters"
        className="flex-1 overflow-y-auto space-y-0.5"
      >
        {items.map((item) => {
          const isSelected = selected?.id === item.id
          return (
            <li
              key={item.id}
              role="option"
              aria-selected={isSelected}
              title={item.tooltip}
              onClick={() => onSelect(item)}
              className={[
                'px-2 py-1.5 rounded cursor-pointer text-sm select-none',
                isSelected
                  ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                  : 'text-[var(--text-primary)] hover:bg-[var(--subtle-fill)]',
              ].join(' ')}
            >
              {item.displayName}
            </li>
          )
        })}
      </ul>

      <div className="pt-2 border-t border-[var(--divider)] space-y-1 flex-shrink-0">
        <Button
          variant="subtle"
          className="w-full justify-start"
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          ⚙ Settings
        </Button>
      </div>
    </div>
  )
}
