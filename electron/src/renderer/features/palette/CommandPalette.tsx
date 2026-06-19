/**
 * CommandPalette — fuzzy project picker overlay.
 *
 * Ports CommandPaletteDialog.xaml + .xaml.cs:
 *   - Opens on Ctrl+K or command-bar trigger
 *   - Fuzzy-filtered list via core fuzzyRank()
 *   - Arrow-key navigation; Enter = continue existing session, Ctrl+Enter = new
 *   - Esc closes
 *   - Shows project name + root leaf name in each row (mirrors WinUI DataTemplate)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fuzzyRank } from '../../../core/projects/fuzzyMatcher'
import type { ProjectInfo } from '../../../core/models'

const MAX_RESULTS = 20

function leafName(path: string): string {
  const t = path.replace(/[/\\]+$/, '')
  const idx = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
  return idx >= 0 ? t.slice(idx + 1) : t
}

export interface CommandPaletteProps {
  open: boolean
  projects: ProjectInfo[]
  onClose: () => void
  /** Called with the chosen project and whether Ctrl was held (isNew=true → new session). */
  onSelectProject: (project: ProjectInfo, isNew: boolean) => void
}

export function CommandPalette({
  open,
  projects,
  onClose,
  onSelectProject,
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = fuzzyRank(query, projects, (p) => p.name).slice(0, MAX_RESULTS)

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // Focus after portal renders
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Clamp selected index when results shrink
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter': {
          const project = filtered[selectedIndex]
          if (project) {
            onSelectProject(project, e.ctrlKey || e.metaKey)
            onClose()
          }
          e.preventDefault()
          break
        }
        case 'Escape':
          onClose()
          e.preventDefault()
          break
      }
    },
    [filtered, selectedIndex, onSelectProject, onClose],
  )

  if (!open) return null

  const content = (
    <div
      data-testid="palette-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-[var(--smoke)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={[
          'w-full max-w-lg rounded-lg shadow-2xl',
          'bg-[var(--acrylic-bg)] border border-[var(--flyout-border)]',
          'flex flex-col overflow-hidden',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-[var(--divider)]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Jump to project…  (Enter = continue, Ctrl+Enter = new)"
            aria-label="Jump to project"
            className={[
              'w-full rounded px-3 py-2 text-sm',
              'bg-[var(--control-fill)] border border-[var(--control-border)]',
              'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
              'focus:outline focus:outline-2 focus:outline-[var(--accent)] focus:border-transparent',
            ].join(' ')}
          />
        </div>

        {/* Results list */}
        <ul
          role="listbox"
          aria-label="Projects"
          className="max-h-80 overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--text-secondary)] text-center opacity-70">
              No projects match
            </li>
          ) : (
            filtered.map((project, idx) => (
              <li
                key={project.path}
                role="option"
                aria-selected={idx === selectedIndex}
                className={[
                  'flex items-center justify-between px-4 py-2 cursor-pointer text-sm',
                  idx === selectedIndex
                    ? 'bg-[var(--accent-fill)] text-[var(--text-on-accent)]'
                    : 'hover:bg-[var(--subtle-fill)] text-[var(--text-primary)]',
                ].join(' ')}
                onClick={() => {
                  onSelectProject(project, false)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="font-medium truncate">{project.name}</span>
                <span
                  className={[
                    'ml-3 text-[11px] flex-shrink-0',
                    idx === selectedIndex
                      ? 'opacity-75'
                      : 'text-[var(--text-tertiary)]',
                  ].join(' ')}
                >
                  {leafName(project.root)}
                </span>
              </li>
            ))
          )}
        </ul>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--divider)] flex gap-4 text-[11px] text-[var(--text-secondary)]">
          <span>↵ Continue</span>
          <span>⌃↵ New</span>
          <span>↑↓ Navigate</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
