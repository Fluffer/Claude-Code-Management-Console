/**
 * DOM-level helpers that apply accent color and font to the document root.
 *
 * Sets CSS custom properties on document.documentElement so themes.css
 * color-mix() derivations automatically recompute all accent shades.
 */
import { resolveAccentHex } from '../../core/theme/accents'
import { resolveFontStack } from '../../core/theme/fonts'

/**
 * Applies the named accent color by setting --accent on the root element.
 * All derived ramp vars (--accent-fill, --accent-light1, etc.) recompute via
 * color-mix() in themes.css without additional JS.
 */
export function applyAccent(id: string): void {
  document.documentElement.style.setProperty('--accent', resolveAccentHex(id))
}

/**
 * Applies the named font by setting --app-font on the root element.
 * The font-family declarations in themes.css reference var(--app-font).
 */
export function applyFont(id: string): void {
  document.documentElement.style.setProperty('--app-font', resolveFontStack(id))
}
