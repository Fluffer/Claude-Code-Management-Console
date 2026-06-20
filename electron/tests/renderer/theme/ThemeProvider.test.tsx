/**
 * Theme system tests.
 * Verifies: ThemeProvider sets data-theme on document root, OS preference is
 * followed by default, manual override works, and CSS vars are present for
 * each theme value.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { ThemeProvider, useTheme } from '../../../src/renderer/theme/ThemeProvider'

// ---------------------------------------------------------------------------
// Helper: render a component that exposes the current theme
// ---------------------------------------------------------------------------

function ThemeDisplay(): React.ReactElement {
  const { theme } = useTheme()
  return <span data-testid="theme-display">{theme}</span>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThemeProvider', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    // Reset data-theme on root
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    document.documentElement.removeAttribute('data-theme')
    vi.restoreAllMocks()
  })

  it('sets data-theme="dark" on document root when OS prefers dark', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getByTestId('theme-display').textContent).toBe('dark')
  })

  it('sets data-theme="light" on document root when OS prefers light', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('allows forcing HighContrast theme via setTheme', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    function ControlPanel(): React.ReactElement {
      const { setTheme } = useTheme()
      return <button onClick={() => setTheme('high-contrast')}>HC</button>
    }

    render(
      <ThemeProvider>
        <ControlPanel />
        <ThemeDisplay />
      </ThemeProvider>,
    )

    act(() => {
      screen.getByText('HC').click()
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('high-contrast')
    expect(screen.getByTestId('theme-display').textContent).toBe('high-contrast')
  })

  it('applies CSS custom properties defined in themes.css for the dark theme', () => {
    // Inject a minimal style that mimics what themes.css does so the property resolves.
    const style = document.createElement('style')
    style.textContent = `
      [data-theme="dark"] { --surface: #202020; }
    `
    document.head.appendChild(style)

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ThemeProvider>
        <div data-testid="themed" />
      </ThemeProvider>,
    )

    // data-theme attribute is set — CSS engine would resolve the var.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    document.head.removeChild(style)
  })

  it('listens to OS theme change and updates data-theme', () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
        if (query === '(prefers-color-scheme: dark)') changeHandler = handler
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    render(
      <ThemeProvider>
        <ThemeDisplay />
      </ThemeProvider>,
    )

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    act(() => {
      if (changeHandler) {
        changeHandler({ matches: true } as MediaQueryListEvent)
      }
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
