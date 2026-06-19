/**
 * App shell — themed frame matching the WinUI MainWindow layout:
 *   ┌────────────────────────────────────────┐
 *   │  title-bar-area                        │
 *   ├────────────┬───────────────────────────┤
 *   │  sidebar   │  content                  │
 *   │  (240px)   │                           │
 *   └────────────┴───────────────────────────┘
 *
 * Slots are empty placeholders; filled by screens in subsequent batches.
 */
import React from 'react'
import { ThemeProvider } from './theme/ThemeProvider'

function AppShell(): React.ReactElement {
  return (
    <div className="flex flex-col h-screen bg-[var(--surface)] text-[var(--text-primary)] font-ui select-none overflow-hidden">
      {/* Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar slot — 240px matching WinUI ColumnDefinition Width="240" */}
        <aside
          className="flex flex-col w-60 border-r border-[var(--divider)] px-3 py-2 flex-shrink-0"
          aria-label="Sidebar"
        >
          {/* Sidebar content rendered by screens */}
        </aside>

        {/* Main content slot */}
        <main className="flex-1 flex flex-col overflow-hidden px-3 py-2">
          {/* Main content rendered by screens */}
        </main>
      </div>

      {/* Status bar slot — matches WinUI Grid.Row="3" status border */}
      <footer className="flex items-center gap-3 px-3 py-1.5 border-t border-[var(--divider)] text-xs text-[var(--text-secondary)]">
        {/* Status content rendered by screens */}
      </footer>
    </div>
  )
}

export default function App(): React.ReactElement {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  )
}
