/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      // Semantic color tokens consuming CSS custom properties from themes.css.
      // Maps Fluent brush names → Tailwind utility classes (e.g. bg-surface, text-primary).
      colors: {
        accent:          'var(--accent)',
        'accent-fill':   'var(--accent-fill)',
        'on-accent':     'var(--text-on-accent)',
        surface:         'var(--surface)',
        layer:           'var(--layer)',
        'subtle-fill':   'var(--subtle-fill)',
        divider:         'var(--divider)',
        'flyout-border': 'var(--flyout-border)',
        smoke:           'var(--smoke)',
        'acrylic-bg':    'var(--acrylic-bg)',
        'ctrl-fill':     'var(--control-fill)',
        'ctrl-border':   'var(--control-border)',
        primary:         'var(--text-primary)',
        secondary:       'var(--text-secondary)',
        tertiary:        'var(--text-tertiary)',
        disabled:        'var(--text-disabled)',
        success:         'var(--fill-success)',
        caution:         'var(--fill-caution)',
        critical:        'var(--fill-critical)',
        attention:       'var(--fill-attention)',
      },
      fontFamily: {
        ui: ['Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        // WinUI OverlayCornerRadius is typically 8px
        overlay: '8px',
      },
    }
  },
  plugins: []
}
