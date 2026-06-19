import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { Sidebar } from '../../../../src/renderer/features/sidebar/Sidebar'
import type { SidebarEntry } from '../../../../src/renderer/features/sidebar/sidebarItems'

const ALL_ENTRY: SidebarEntry = {
  id: '__all__',
  displayName: 'All (3)',
  root: null,
  filter: null,
  tooltip: 'All projects',
}
const ROOT_ENTRY: SidebarEntry = {
  id: 'root:/r1',
  displayName: 'r1 (2)',
  root: '/r1',
  filter: null,
  tooltip: '/r1',
}

describe('Sidebar', () => {
  beforeEach(() => installMockCcmc())

  it('renders all sidebar entries', () => {
    render(
      <Sidebar
        items={[ALL_ENTRY, ROOT_ENTRY]}
        selected={ALL_ENTRY}
        onSelect={vi.fn()}
        onSettingsClick={vi.fn()}
      />,
    )
    expect(screen.getByText('All (3)')).toBeInTheDocument()
    expect(screen.getByText('r1 (2)')).toBeInTheDocument()
  })

  it('calls onSelect when an entry is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <Sidebar
        items={[ALL_ENTRY, ROOT_ENTRY]}
        selected={ALL_ENTRY}
        onSelect={onSelect}
        onSettingsClick={vi.fn()}
      />,
    )
    await user.click(screen.getByText('r1 (2)'))
    expect(onSelect).toHaveBeenCalledWith(ROOT_ENTRY)
  })

  it('marks the selected entry with aria-selected=true', () => {
    render(
      <Sidebar
        items={[ALL_ENTRY, ROOT_ENTRY]}
        selected={ROOT_ENTRY}
        onSelect={vi.fn()}
        onSettingsClick={vi.fn()}
      />,
    )
    const selectedItem = screen.getByRole('option', { name: 'r1 (2)' })
    expect(selectedItem).toHaveAttribute('aria-selected', 'true')
  })

  it('marks unselected entries with aria-selected=false', () => {
    render(
      <Sidebar
        items={[ALL_ENTRY, ROOT_ENTRY]}
        selected={ROOT_ENTRY}
        onSelect={vi.fn()}
        onSettingsClick={vi.fn()}
      />,
    )
    const unselected = screen.getByRole('option', { name: 'All (3)' })
    expect(unselected).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onSettingsClick when Settings button is clicked', async () => {
    const user = userEvent.setup()
    const onSettings = vi.fn()
    render(
      <Sidebar
        items={[ALL_ENTRY]}
        selected={ALL_ENTRY}
        onSelect={vi.fn()}
        onSettingsClick={onSettings}
      />,
    )
    await user.click(screen.getByRole('button', { name: /settings/i }))
    expect(onSettings).toHaveBeenCalledOnce()
  })
})
