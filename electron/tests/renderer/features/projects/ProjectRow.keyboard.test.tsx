/**
 * Tests for #17 row-level keyboard shortcuts:
 *   Enter           → launch-continue
 *   Ctrl+Enter      → launch-new
 *   Ctrl+Shift+Enter → launch-quick-prompt
 *
 * Also verifies that shortcuts do NOT fire when an inner button is the event target.
 */
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

const ENRICHMENT: ProjectEnrichment = {
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

describe('ProjectRow keyboard shortcuts', () => {
  beforeEach(() => installMockCcmc())

  it('row has tabIndex=0 so it is focusable', () => {
    const { container } = render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={ENRICHMENT}
        onAction={vi.fn()}
      />,
    )
    // The outer div should be keyboard-focusable
    const row = container.firstElementChild as HTMLElement
    expect(row.tabIndex).toBe(0)
  })

  it('Enter on row dispatches launch-continue', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const { container } = render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={ENRICHMENT}
        onAction={onAction}
      />,
    )
    const row = container.firstElementChild as HTMLElement
    row.focus()
    await user.keyboard('{Enter}')
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'launch-continue' }),
    )
  })

  it('Ctrl+Enter on row dispatches launch-new', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const { container } = render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={ENRICHMENT}
        onAction={onAction}
      />,
    )
    const row = container.firstElementChild as HTMLElement
    row.focus()
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'launch-new' }),
    )
  })

  it('Ctrl+Shift+Enter on row dispatches launch-quick-prompt', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const { container } = render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={ENRICHMENT}
        onAction={onAction}
      />,
    )
    const row = container.firstElementChild as HTMLElement
    row.focus()
    await user.keyboard('{Control>}{Shift>}{Enter}{/Shift}{/Control}')
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'launch-quick-prompt' }),
    )
  })

  it('Enter on an inner button does NOT dispatch a row action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ProjectRow
        project={makeProject()}
        isRunning={false}
        isPinned={false}
        enrichment={ENRICHMENT}
        onAction={onAction}
      />,
    )
    // Focus the New button (an inner button)
    const newBtn = screen.getByRole('button', { name: /^new$/i })
    newBtn.focus()
    await user.keyboard('{Enter}')
    // The button click fires launch-new, but the ROW onKeyDown must NOT fire an extra action
    // (target !== currentTarget guard). Since the button itself fires launch-new on click via
    // userEvent Enter-on-button, the action count should be exactly 1 (from the button).
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'launch-new' }),
    )
  })
})
