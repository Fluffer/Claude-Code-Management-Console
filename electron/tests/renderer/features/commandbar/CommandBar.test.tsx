import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { CommandBar } from '../../../../src/renderer/features/commandbar/CommandBar'
import type { LaunchGroup, SavedFilter } from '../../../../src/core/models'

interface Overrides {
  anySessionRunning?: boolean
  groups?: LaunchGroup[]
  savedFilters?: SavedFilter[]
  onNewProject?: () => void
  onRefresh?: () => void
  onStopAll?: () => void
  onManageProfiles?: () => void
  onLaunchGroup?: (g: LaunchGroup) => void
  onManageGroups?: () => void
  onSelectFilter?: (f: SavedFilter) => void
  onManageFilters?: () => void
}

function renderBar(o: Overrides = {}): void {
  render(
    <CommandBar
      anySessionRunning={o.anySessionRunning ?? false}
      groups={o.groups ?? []}
      savedFilters={o.savedFilters ?? []}
      onNewProject={o.onNewProject ?? vi.fn()}
      onRefresh={o.onRefresh ?? vi.fn()}
      onStopAll={o.onStopAll ?? vi.fn()}
      onManageProfiles={o.onManageProfiles ?? vi.fn()}
      onLaunchGroup={o.onLaunchGroup ?? vi.fn()}
      onManageGroups={o.onManageGroups ?? vi.fn()}
      onSelectFilter={o.onSelectFilter ?? vi.fn()}
      onManageFilters={o.onManageFilters ?? vi.fn()}
    />,
  )
}

describe('CommandBar', () => {
  beforeEach(() => installMockCcmc())

  it('renders New Project button', () => {
    renderBar()
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
  })

  it('renders Refresh button', () => {
    renderBar()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('calls onNewProject when New Project clicked', async () => {
    const user = userEvent.setup()
    const onNewProject = vi.fn()
    renderBar({ onNewProject })
    await user.click(screen.getByRole('button', { name: /new project/i }))
    expect(onNewProject).toHaveBeenCalledOnce()
  })

  it('calls onRefresh when Refresh clicked', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    renderBar({ onRefresh })
    await user.click(screen.getByRole('button', { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('hides Stop All when no sessions running', () => {
    renderBar({ anySessionRunning: false })
    expect(screen.queryByRole('button', { name: /stop all/i })).not.toBeInTheDocument()
  })

  it('shows Stop All when sessions are running', () => {
    renderBar({ anySessionRunning: true })
    expect(screen.getByRole('button', { name: /stop all/i })).toBeInTheDocument()
  })

  it('calls onStopAll when Stop All clicked', async () => {
    const user = userEvent.setup()
    const onStopAll = vi.fn()
    renderBar({ anySessionRunning: true, onStopAll })
    await user.click(screen.getByRole('button', { name: /stop all/i }))
    expect(onStopAll).toHaveBeenCalledOnce()
  })

  it('calls onManageProfiles when Profiles clicked', async () => {
    const user = userEvent.setup()
    const onManageProfiles = vi.fn()
    renderBar({ onManageProfiles })
    await user.click(screen.getByRole('button', { name: /profiles/i }))
    expect(onManageProfiles).toHaveBeenCalledOnce()
  })

  it('launches a group from the Groups dropdown', async () => {
    const user = userEvent.setup()
    const onLaunchGroup = vi.fn()
    const group: LaunchGroup = { name: 'stack', projectPaths: ['/r1/a', '/r1/b'] }
    renderBar({ groups: [group], onLaunchGroup })
    await user.click(screen.getByRole('button', { name: /groups/i }))
    await user.click(screen.getByText(/▶ stack \(2\)/))
    expect(onLaunchGroup).toHaveBeenCalledWith(group)
  })

  it('opens manage groups from the Groups dropdown', async () => {
    const user = userEvent.setup()
    const onManageGroups = vi.fn()
    renderBar({ onManageGroups })
    await user.click(screen.getByRole('button', { name: /groups/i }))
    await user.click(screen.getByText(/manage groups/i))
    expect(onManageGroups).toHaveBeenCalledOnce()
  })

  it('selects a saved filter from the Filters dropdown', async () => {
    const user = userEvent.setup()
    const onSelectFilter = vi.fn()
    const filter: SavedFilter = {
      name: 'work',
      pathContains: null,
      requireGit: false,
      requireClaudeMd: false,
      requireRunning: false,
      requirePinned: false,
    }
    renderBar({ savedFilters: [filter], onSelectFilter })
    await user.click(screen.getByRole('button', { name: /filters/i }))
    await user.click(screen.getByText('work'))
    expect(onSelectFilter).toHaveBeenCalledWith(filter)
  })

  it('opens manage filters from the Filters dropdown', async () => {
    const user = userEvent.setup()
    const onManageFilters = vi.fn()
    renderBar({ onManageFilters })
    await user.click(screen.getByRole('button', { name: /filters/i }))
    await user.click(screen.getByText(/manage filters/i))
    expect(onManageFilters).toHaveBeenCalledOnce()
  })
})
