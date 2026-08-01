/**
 * HelpDialog — ports HelpWindow.xaml + .xaml.cs as a modal.
 *
 * The C# implementation opens a separate Window (680×640). The Electron port
 * renders the same content in the standard Modal component so it fits the
 * renderer-side dialog host pattern. No IPC required — all content is static.
 *
 * Content faithfully ported from HelpWindow.xaml: overview, launching sessions,
 * sidebar, flags (using core flagCatalog.PRESETS), project rows, rename/move,
 * creating projects, keyboard shortcuts, good-to-know notes.
 */
import React from 'react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { PRESETS } from '../../../core/config/flagCatalog'

export interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">{title}</h3>
      {children}
    </div>
  )
}

function Para({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-sm text-[var(--text-secondary)] mb-1 leading-relaxed">{children}</p>
  )
}

function Bullet({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-sm text-[var(--text-secondary)] mb-0.5 leading-relaxed pl-3">
      • {children}
    </p>
  )
}

const SHORTCUTS = [
  { key: 'Enter', desc: "Continue the selected project's last session" },
  { key: 'Ctrl+Enter', desc: 'Start a new session in the selected project' },
  { key: 'Ctrl+Shift+Enter', desc: 'Open quick-prompt dialog for the selected project' },
  { key: 'Ctrl+F', desc: 'Focus the search box' },
  { key: 'Esc', desc: 'Clear the search' },
  { key: 'Ctrl+N', desc: 'New project dialog' },
  { key: 'Ctrl+K / Ctrl+P', desc: 'Open the command palette' },
  { key: 'F5', desc: 'Refresh the project list' },
  { key: 'F1', desc: 'This help dialog' },
]

export function HelpDialog({ open, onClose }: HelpDialogProps): React.ReactElement {
  const footer = (
    <Button onClick={onClose} variant="subtle">
      Close
    </Button>
  )

  return (
    <Modal
      open={open}
      title="Claude Code Management Console — Help"
      onClose={onClose}
      footer={footer}
      size="lg"
    >
      {/* Modal body owns the scroll + height cap now; no inner min-width (it forced
          horizontal overflow past the panel). */}
      <div>

        <Para>
          Claude Code Management Console is a launcher hub for Claude Code. It lists every project
          folder found under your source roots and opens Claude sessions in Windows Terminal tabs.
          The hub stays open, so you can launch as many sessions as you like.
        </Para>

        <Section title="Launching sessions">
          <Bullet>New — starts a fresh Claude session in the project folder (runs: claude).</Bullet>
          <Bullet>
            Continue — resumes the most recent session in that folder (runs: claude --continue).
            It is greyed out when no previous session exists for the folder.
          </Bullet>
          <Bullet>
            Each launch opens as a new tab in your existing Windows Terminal window, titled with
            the project name.
          </Bullet>
        </Section>

        <Section title="Sidebar — source roots">
          <Para>
            Each entry is a folder that gets scanned for projects (every direct subfolder is one
            project). Click a root to filter the list, or &lsquo;All&rsquo; to see everything.
            Greyed-out roots don&rsquo;t exist on disk right now. Manage roots in Settings.
          </Para>
        </Section>

        <Section title="Flags">
          <Para>
            Flags are extra command-line options saved per project — for example
            &lsquo;--model opus&rsquo; — and are passed to both New and Continue. Set them with
            the model picker on each row, or apply a launch profile (Profiles… in the sidebar)
            to write a whole bundle at once. Common flags:
          </Para>
          <div className="mt-2 flex flex-col gap-2 pl-3">
            {PRESETS.map((preset) => (
              <div key={preset.insertText}>
                <code className="text-xs font-mono font-semibold text-[var(--text-primary)]">
                  {preset.display}
                </code>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{preset.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Project rows">
          <Bullet>☆ pins a project to the top of the list.</Bullet>
          <Bullet>The coloured chip shows which root the project lives in.</Bullet>
          <Bullet>⎇ shows the current git branch; an orange dot means uncommitted changes.</Bullet>
          <Bullet>
            A green &lsquo;live&rsquo; badge means a Claude session is running there right now.
            Updates every 30 seconds; the status bar shows the total count.
          </Bullet>
          <Bullet>
            Right-click a row for quick actions: Open in Explorer, Open in VS Code, Copy path,
            Rename, Move to another root, Pin/Unpin.
          </Bullet>
        </Section>

        <Section title="Renaming &amp; moving projects">
          <Bullet>
            Rename… changes the folder name in place; Move to root relocates the folder to another
            source root.
          </Bullet>
          <Bullet>Saved flags, last-used time and pin status follow the project automatically.</Bullet>
          <Bullet>
            Claude session history is tied to the folder path, so Continue starts fresh after a
            rename/move. Close any session running in the folder first.
          </Bullet>
        </Section>

        <Section title="Creating projects">
          <Para>
            ＋ New Project creates an empty folder under a chosen root and can start Claude in it
            straight away.
          </Para>
        </Section>

        <Section title="Keyboard shortcuts">
          <div className="mt-1 flex flex-col gap-1 pl-3">
            {SHORTCUTS.map(({ key, desc }) => (
              <div key={key} className="flex gap-4 text-sm">
                <code className="font-mono text-[var(--text-primary)] w-28 shrink-0">{key}</code>
                <span className="text-[var(--text-secondary)]">{desc}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Good to know">
          <Bullet>The list refreshes automatically when folders are added or removed under a root.</Bullet>
          <Bullet>Settings are stored in %APPDATA%\ccmc (config.json and state.json).</Bullet>
          <Bullet>Removing a source root never deletes anything on disk — it only stops scanning.</Bullet>
          <Bullet>The status bar shows the claude CLI version that will be used for launches.</Bullet>
          <Bullet>Drop a folder onto the window to add it as a source root.</Bullet>
        </Section>

      </div>
    </Modal>
  )
}
