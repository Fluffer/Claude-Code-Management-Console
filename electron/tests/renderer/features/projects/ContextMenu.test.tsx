import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { ContextMenu } from '../../../../src/renderer/features/projects/ContextMenu'
import type { ProjectEnrichment } from '../../../../src/renderer/features/projects/ProjectRow'
import type { ProjectInfo } from '../../../../src/core/models'

function makeProject(): ProjectInfo {
  return {
    name: 'my-project',
    root: '/r1',
    path: '/r1/my-project',
    lastUsedUtc: null,
    flags: '',
    description: '',
  }
}

/** Enrichment with every conditional flag enabled — surfaces all menu items. */
function fullEnrichment(): ProjectEnrichment {
  return {
    gitBranch: 'main',
    gitDirty: false,
    hasClaudeMd: true,
    hasMcp: true,
    hasCommands: false,
    hasSkills: false,
    hasSettingsError: true,
    settingsError: 'boom',
    hasSession: true,
    newestSessionUtc: null,
    defaultModel: null,
  }
}

interface RenderOpts {
  isOpen?: boolean
  isRunning?: boolean
  enrichment?: ProjectEnrichment | null
  onClose?: () => void
  onAction?: (...args: unknown[]) => void
}

function renderMenu(opts: RenderOpts = {}): void {
  render(
    <ContextMenu
      project={makeProject()}
      isOpen={opts.isOpen ?? true}
      isRunning={opts.isRunning ?? true}
      enrichment={opts.enrichment === undefined ? fullEnrichment() : opts.enrichment}
      onClose={opts.onClose ?? vi.fn()}
      onAction={opts.onAction ?? vi.fn()}
    />,
  )
}

describe('ContextMenu', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  it('renders expected menu items when open', () => {
    renderMenu()
    expect(screen.getByText('Open in Explorer')).toBeInTheDocument()
    expect(screen.getByText('Rename…')).toBeInTheDocument()
    expect(screen.getByText('Pin / Unpin')).toBeInTheDocument()
    expect(screen.getByText('Hide from console')).toBeInTheDocument()
    expect(screen.getByText('Delete from disk…')).toBeInTheDocument()
    expect(screen.getByText('Copy path')).toBeInTheDocument()
    expect(screen.getByText('Stop session')).toBeInTheDocument()
    expect(screen.getByText('Quick prompt…')).toBeInTheDocument()
    expect(screen.getByText('Launch in worktree…')).toBeInTheDocument()
    expect(screen.getByText('Edit .env…')).toBeInTheDocument()
  })

  it('does not render when isOpen=false', () => {
    renderMenu({ isOpen: false })
    expect(screen.queryByText('Open in Explorer')).not.toBeInTheDocument()
  })

  it('hides conditional items when not applicable', () => {
    // No enrichment + not running → CLAUDE.md / settings.json / MCP / worktree /
    // Stop session all gated off; unconditional items still present.
    renderMenu({ isRunning: false, enrichment: null })
    expect(screen.getByText('Open in Explorer')).toBeInTheDocument()
    expect(screen.queryByText('Open CLAUDE.md')).not.toBeInTheDocument()
    expect(screen.queryByText('Open settings.json')).not.toBeInTheDocument()
    expect(screen.queryByText('View MCP servers…')).not.toBeInTheDocument()
    expect(screen.queryByText('Stop session')).not.toBeInTheDocument()
    expect(screen.queryByText('Launch in worktree…')).not.toBeInTheDocument()
  })

  it('pin-toggle calls onAction with pin-toggle kind', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderMenu({ onAction })
    await user.click(screen.getByText('Pin / Unpin'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'pin-toggle' }))
  })

  it('rename dispatches dialog action via onAction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderMenu({ onAction })
    await user.click(screen.getByText('Rename…'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rename' }))
  })

  it('hide dispatches dialog action via onAction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderMenu({ onAction })
    await user.click(screen.getByText('Hide from console'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hide' }))
  })

  it('delete dispatches dialog action via onAction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderMenu({ onAction })
    await user.click(screen.getByText('Delete from disk…'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delete' }))
  })

  it('open-folder dispatches open-folder action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    renderMenu({ onAction })
    await user.click(screen.getByText('Open in Explorer'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'open-folder' }))
  })

  it('calls onClose after dispatching an action', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderMenu({ onClose })
    await user.click(screen.getByText('Copy path'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('run-command item present and dispatches run-command when hasCommands:true', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const project = makeProject()
    render(
      <ContextMenu
        project={project}
        isOpen={true}
        isRunning={false}
        enrichment={{ ...fullEnrichment(), hasCommands: true }}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    expect(screen.getByText('Run command…')).toBeInTheDocument()
    await user.click(screen.getByText('Run command…'))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'run-command', project }),
    )
  })

  it('view-skills item present and dispatches view-skills when hasSkills:true', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const project = makeProject()
    render(
      <ContextMenu
        project={project}
        isOpen={true}
        isRunning={false}
        enrichment={{ ...fullEnrichment(), hasSkills: true }}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    expect(screen.getByText('View skills…')).toBeInTheDocument()
    await user.click(screen.getByText('View skills…'))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'view-skills', project }),
    )
  })

  it('dispatches duplicate when "Duplicate…" is clicked', () => {
    const onAction = vi.fn()
    renderMenu({ onAction }) // use the file's existing render helper
    fireEvent.click(screen.getByText('Duplicate…'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'duplicate' }))
  })

  it('all context menu actions render as menu items', () => {
    renderMenu()
    const items = screen.getAllByRole('menuitem')
    // 22 items: open-folder, open-vscode, open-claude-md, open-settings-json,
    // view-mcp, copy-path, copy-deep-link, rename, move-to-root, duplicate,
    // apply-profile, pin-toggle, stop-session, launch-quick-prompt, launch-worktree,
    // commit, open-pr, resume-session, edit-env, open-claudeignore, hide, delete
    expect(items.length).toBe(22)
  })
})
