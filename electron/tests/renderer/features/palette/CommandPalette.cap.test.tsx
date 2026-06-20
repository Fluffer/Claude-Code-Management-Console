/**
 * Tests palette MAX_RESULTS cap raised to 50 (#22).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { CommandPalette } from '../../../../src/renderer/features/palette/CommandPalette'
import type { ProjectInfo } from '../../../../src/core/models'

function mockMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
}

function makeProjects(count: number): ProjectInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `project-${String(i).padStart(3, '0')}`,
    root: '/r1',
    path: `/r1/project-${i}`,
    lastUsedUtc: null,
    flags: '',
    description: '',
  }))
}

describe('CommandPalette result cap (#22)', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
  })

  it('shows up to 50 results when 60 projects exist', () => {
    const projects = makeProjects(60)
    render(
      <CommandPalette
        open={true}
        projects={projects}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    const items = screen.getAllByRole('option')
    expect(items).toHaveLength(50)
  })

  it('shows all results when fewer than 50 projects exist', () => {
    const projects = makeProjects(30)
    render(
      <CommandPalette
        open={true}
        projects={projects}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    const items = screen.getAllByRole('option')
    expect(items).toHaveLength(30)
  })

  it('palette container has data-testid="command-palette"', () => {
    render(
      <CommandPalette
        open={true}
        projects={makeProjects(3)}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
  })
})
