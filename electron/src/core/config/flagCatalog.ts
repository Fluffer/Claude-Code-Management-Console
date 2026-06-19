/**
 * Curated list of common claude CLI flags surfaced in the UI.
 * Direct port of C# ClaudeFlagCatalog / FlagPreset.
 *
 * Deliberately short and conservative — review against `claude --help` when
 * updating the app, since CLI flags drift between versions.
 */

/** A common claude CLI flag with a plain-English description for the flags builder. */
export interface FlagPreset {
  display: string
  insertText: string
  description: string
}

export const PRESETS: readonly FlagPreset[] = [
  {
    display: '--model sonnet',
    insertText: '--model sonnet',
    description: 'Use Sonnet — fast and great for everyday coding tasks.',
  },
  {
    display: '--model opus',
    insertText: '--model opus',
    description: 'Use Opus — the most capable model, best for complex work.',
  },
  {
    display: '--permission-mode plan',
    insertText: '--permission-mode plan',
    description: 'Start in Plan Mode: Claude proposes a plan for approval before changing anything.',
  },
  {
    display: '--permission-mode acceptEdits',
    insertText: '--permission-mode acceptEdits',
    description: 'Auto-accept file edits; commands still ask for permission.',
  },
  {
    display: '--resume',
    insertText: '--resume',
    description: 'Pick a specific past session to resume from a list (instead of the most recent).',
  },
  {
    display: '--verbose',
    insertText: '--verbose',
    description: 'Show detailed output for every step Claude takes.',
  },
  {
    display: '--add-dir <path>',
    insertText: '--add-dir ',
    description: 'Give Claude access to an additional folder outside the project.',
  },
]
