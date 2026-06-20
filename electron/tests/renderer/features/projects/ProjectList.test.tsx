import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { ProjectList } from '../../../../src/renderer/features/projects/ProjectList'
import type { ProjectInfo, RunningSession } from '../../../../src/core/models'

function makeProject(name: string, path?: string): ProjectInfo {
  return {
    name,
    root: '/r1',
    path: path ?? `/r1/${name}`,
    lastUsedUtc: null,
    flags: '',
    description: '',
  }
}

const SESSION_FOR_ALPHA: RunningSession = {
  pid: 1001,
  processName: 'claude',
  workingDirectory: '/r1/alpha',
}

describe('ProjectList', () => {
  beforeEach(() => installMockCcmc())

  it('shows spinner when loading', () => {
    render(
      <ProjectList
        projects={[]}
        loading={true}
        error={null}
        searchText=""
        runningSessions={[]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows error message with retry button when error is set', () => {
    const onRetry = vi.fn()
    render(
      <ProjectList
        projects={[]}
        loading={false}
        error="scan failed"
        searchText=""
        runningSessions={[]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText(/scan failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows "no projects found" when projects=[] and no search', () => {
    render(
      <ProjectList
        projects={[]}
        loading={false}
        error={null}
        searchText=""
        runningSessions={[]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText(/no projects found/i)).toBeInTheDocument()
  })

  it('shows "no projects match" when projects=[] and search is set', () => {
    render(
      <ProjectList
        projects={[]}
        loading={false}
        error={null}
        searchText="zzz"
        runningSessions={[]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText(/no projects match/i)).toBeInTheDocument()
  })

  it('renders a row for each project', () => {
    render(
      <ProjectList
        projects={[makeProject('alpha'), makeProject('beta')]}
        loading={false}
        error={null}
        searchText=""
        runningSessions={[]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('passes isRunning=true to the matching project row', () => {
    render(
      <ProjectList
        projects={[makeProject('alpha'), makeProject('beta')]}
        loading={false}
        error={null}
        searchText=""
        runningSessions={[SESSION_FOR_ALPHA]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    // "● live" badge appears exactly once (for alpha)
    expect(screen.getAllByText(/live/i)).toHaveLength(1)
  })

  it('running match is case-insensitive', () => {
    const upperPathSession: RunningSession = {
      pid: 1002,
      processName: 'claude',
      workingDirectory: '/R1/ALPHA', // uppercase
    }
    render(
      <ProjectList
        projects={[makeProject('alpha', '/r1/alpha')]}
        loading={false}
        error={null}
        searchText=""
        runningSessions={[upperPathSession]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText(/live/i)).toBeInTheDocument()
  })

  it('does not show running badge when no session matches', () => {
    render(
      <ProjectList
        projects={[makeProject('alpha'), makeProject('beta')]}
        loading={false}
        error={null}
        searchText=""
        runningSessions={[]}
        pinnedPaths={[]}
        onAction={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument()
  })
})
