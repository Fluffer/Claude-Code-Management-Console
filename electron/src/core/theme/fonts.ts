/**
 * Curated UI font options.
 *
 * Pure module — no DOM access.
 * The Default stack matches ContentControlThemeFontFamily in WinUI / the current
 * themes.css declaration exactly.
 */

export interface FontOption {
  id: string
  name: string
  stack: string
}

export const FONTS: FontOption[] = [
  {
    id: 'default',
    name: 'Default',
    stack: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
  },
  {
    id: 'segoe',
    name: 'Segoe UI',
    stack: "'Segoe UI', system-ui, sans-serif",
  },
  {
    id: 'system',
    name: 'System',
    stack: 'system-ui, sans-serif',
  },
  {
    id: 'verdana',
    name: 'Verdana',
    stack: 'Verdana, Geneva, sans-serif',
  },
  {
    id: 'arial',
    name: 'Arial',
    stack: 'Arial, Helvetica, sans-serif',
  },
  {
    id: 'consolas',
    name: 'Consolas',
    stack: "Consolas, 'Courier New', monospace",
  },
  {
    id: 'cascadia',
    name: 'Cascadia Code',
    stack: "'Cascadia Code', Consolas, monospace",
  },
]

const DEFAULT_STACK = "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"

/**
 * Returns the font-family stack string for the given font id.
 * Unknown id or empty string → Default stack.
 */
export function resolveFontStack(id: string): string {
  if (!id) return DEFAULT_STACK
  const found = FONTS.find((f) => f.id === id)
  return found ? found.stack : DEFAULT_STACK
}
