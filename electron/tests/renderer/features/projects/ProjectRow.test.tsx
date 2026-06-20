import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { ProjectRow } from '../../../../src/renderer/features/projects/ProjectRow'
import type { ProjectInfo } from '../../../../src/core/models'
import type { ProjectEnrichment } from '../../../../src/renderer/features/projects/ProjectRow'

function makeProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'my-project',
    root: '/r1',
    path: '/r1/my-project',
    lastUsedUtc: null,
    flags: '',
    description: '',
    ...overrides,
  }
}

const FULL_ENRICHMENT: ProjectEnrichment = {
  gitBranch: null,
  gitDirty: null,
  hasClaudeMd: false,
  hasMcp: false,
  hasCommands: false,
  hasSkills: false,
  hasSettingsError: false,
  settingsError: '',
  hasSession: true,
  isStale: false,
  defaultModel: null,
}

describe('ProjectRow', () => {
  beforeEach(() => installMockCcmc())

  it('renders project name', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('shows running badge when isRunning=true', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={true}
        isPinned={false}
        enrichment={null}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText(/live/i)).toBeInTheDocument()
  })

  it('does not show running badge when isRunning=false', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={vi.fn()}
      />,
    )
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument()
  })

  it('shows git branch when enrichment provides it', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, gitBranch: 'main', gitDirty: false }}
        onAction={vi.fn()}
      />,
    )
    // Branch info is in a span with a title tooltip
    expect(screen.getByTitle(/Git branch 'main'/i)).toBeInTheDocument()
  })

  it('shows dirty dot when gitDirty=true', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, gitBranch: 'feat/x', gitDirty: true }}
        onAction={vi.fn()}
      />,
    )
    // The branch text is rendered inside a span as "⎇ feat/x"
    expect(screen.getByTitle(/Git branch 'feat\/x' — has uncommitted/i)).toBeInTheDocument()
    // dirty dot is a ● in a yellow span
    const dot = screen.getByText('●')
    expect(dot).toBeInTheDocument()
  })

  it('shows CLAUDE.md badge when enrichment.hasClaudeMd is true', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, hasClaudeMd: true }}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
  })

  it('shows MCP badge when enrichment.hasMcp is true', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, hasMcp: true }}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText('MCP')).toBeInTheDocument()
  })

  it('shows settings error badge when enrichment.hasSettingsError is true', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, hasSettingsError: true, settingsError: 'JSON parse error' }}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText(/settings\.json/i)).toBeInTheDocument()
  })

  it('shows stale badge when enrichment.isStale is true', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, isStale: true }}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText('stale')).toBeInTheDocument()
  })

  it('shows description when project has one', () => {
    render(
      <ProjectRow
        project={makeProject({ description: 'A test project' })}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText('A test project')).toBeInTheDocument()
  })

  it('shows last-used text when lastUsedUtc is set', () => {
    render(
      <ProjectRow
        project={makeProject({ lastUsedUtc: '2026-06-18T12:00:00Z' })}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={vi.fn()}
      />,
    )
    const el = screen.getByTestId('last-used')
    expect(el.textContent).not.toBe('')
  })

  it('Continue button calls onAction with launch-continue', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={FULL_ENRICHMENT}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'launch-continue' }),
    )
  })

  it('New button calls onAction with launch-new', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^new$/i }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'launch-new' }),
    )
  })

  it('pin button calls onAction with pin-toggle', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByRole('button', { name: /pin/i }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pin-toggle' }),
    )
  })

  it('Continue button is disabled when enrichment.hasSession=false', () => {
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={{ ...FULL_ENRICHMENT, hasSession: false }}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('shows root leaf name badge', () => {
    render(
      <ProjectRow
        project={makeProject({ root: '/home/user/projects' })}
        isRunning={false}
        isPinned={false}
        enrichment={null}
        onAction={vi.fn()}
      />,
    )
    expect(screen.getByText('projects')).toBeInTheDocument()
  })
})
