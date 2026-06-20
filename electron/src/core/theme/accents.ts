/**
 * Curated accent color options.
 *
 * Pure module — no DOM access.
 * Mirrors the accent palette in Accents.cs (WinUI reference).
 */

export interface AccentOption {
  id: string
  name: string
  hex: string
}

export const ACCENTS: AccentOption[] = [
  { id: 'default', name: 'Default', hex: '#0078d4' },
  { id: 'purple',  name: 'Purple',  hex: '#8b5cf6' },
  { id: 'teal',    name: 'Teal',    hex: '#0d9488' },
  { id: 'green',   name: 'Green',   hex: '#16a34a' },
  { id: 'orange',  name: 'Orange',  hex: '#ea580c' },
  { id: 'red',     name: 'Red',     hex: '#dc2626' },
  { id: 'pink',    name: 'Pink',    hex: '#db2777' },
]

const DEFAULT_HEX = '#0078d4'

/**
 * Returns the hex value for the given accent id.
 * Unknown id or empty string → Default (#0078d4).
 */
export function resolveAccentHex(id: string): string {
  if (!id) return DEFAULT_HEX
  const found = ACCENTS.find((a) => a.id === id)
  return found ? found.hex : DEFAULT_HEX
}
