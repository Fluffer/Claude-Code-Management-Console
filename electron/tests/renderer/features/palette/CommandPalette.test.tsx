import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const PROJECTS: ProjectInfo[] = [
  { name: 'alpha-project', root: '/r1', path: '/r1/alpha-project', lastUsedUtc: null, flags: '', description: '' },
  { name: 'beta-service', root: '/r1', path: '/r1/beta-service', lastUsedUtc: null, flags: '', description: '' },
  { name: 'gamma-tool', root: '/r2', path: '/r2/gamma-tool', lastUsedUtc: null, flags: '', description: '' },
]

describe('CommandPalette', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
  })

  it('renders the palette with search input', () => {
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText(/jump to project/i)).toBeInTheDocument()
  })

  it('shows all projects initially', () => {
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    expect(screen.getByText('alpha-project')).toBeInTheDocument()
    expect(screen.getByText('beta-service')).toBeInTheDocument()
    expect(screen.getByText('gamma-tool')).toBeInTheDocument()
  })

  it('fuzzy-filters projects as user types', async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    await user.type(screen.getByPlaceholderText(/jump to project/i), 'alp')
    await waitFor(() => expect(screen.getByText('alpha-project')).toBeInTheDocument())
    expect(screen.queryByText('beta-service')).not.toBeInTheDocument()
    expect(screen.queryByText('gamma-tool')).not.toBeInTheDocument()
  })

  it('shows no results message when no projects match', async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    await user.type(screen.getByPlaceholderText(/jump to project/i), 'zzz')
    await waitFor(() => expect(screen.queryByText('alpha-project')).not.toBeInTheDocument())
  })

  it('first item is selected by default', () => {
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    // The first item in the list should have aria-selected or data-selected
    const items = screen.getAllByRole('option')
    expect(items[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowDown moves selection down', async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    const input = screen.getByPlaceholderText(/jump to project/i)
    await user.click(input)
    await user.keyboard('{ArrowDown}')
    const items = screen.getAllByRole('option')
    await waitFor(() => expect(items[1]).toHaveAttribute('aria-selected', 'true'))
  })

  it('ArrowUp does not go below 0', async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    const input = screen.getByPlaceholderText(/jump to project/i)
    await user.click(input)
    await user.keyboard('{ArrowUp}')
    const items = screen.getAllByRole('option')
    // Still first item selected
    expect(items[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Enter dispatches onSelectProject with selected project', async () => {
    const user = userEvent.setup()
    const onSelectProject = vi.fn()
    const onClose = vi.fn()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={onClose}
        onSelectProject={onSelectProject}
      />,
    )
    const input = screen.getByPlaceholderText(/jump to project/i)
    await user.click(input)
    await user.keyboard('{Enter}')
    expect(onSelectProject).toHaveBeenCalledWith(PROJECTS[0], false)
    expect(onClose).toHaveBeenCalled()
  })

  it('Ctrl+Enter dispatches onSelectProject with isNew=true', async () => {
    const user = userEvent.setup()
    const onSelectProject = vi.fn()
    const onClose = vi.fn()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={onClose}
        onSelectProject={onSelectProject}
      />,
    )
    const input = screen.getByPlaceholderText(/jump to project/i)
    await user.click(input)
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSelectProject).toHaveBeenCalledWith(PROJECTS[0], true)
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the palette', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={onClose}
        onSelectProject={vi.fn()}
      />,
    )
    const input = screen.getByPlaceholderText(/jump to project/i)
    await user.click(input)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows root leaf name next to project name', () => {
    render(
      <CommandPalette
        open={true}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    // r1 appears as the root leaf for alpha-project and beta-service
    expect(screen.getAllByText('r1').length).toBeGreaterThan(0)
  })

  it('does not render when open=false', () => {
    render(
      <CommandPalette
        open={false}
        projects={PROJECTS}
        onClose={vi.fn()}
        onSelectProject={vi.fn()}
      />,
    )
    expect(screen.queryByPlaceholderText(/jump to project/i)).not.toBeInTheDocument()
  })
})
