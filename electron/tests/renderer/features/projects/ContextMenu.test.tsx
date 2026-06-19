import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc } from '../../mockCcmc'
import { ContextMenu } from '../../../../src/renderer/features/projects/ContextMenu'
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

describe('ContextMenu', () => {
  beforeEach(() => {
    installMockCcmc()
  })

  it('renders expected menu items when open', () => {
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    )
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
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={false}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    expect(screen.queryByText('Open in Explorer')).not.toBeInTheDocument()
  })

  it('pin-toggle calls onAction with pin-toggle kind', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByText('Pin / Unpin'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'pin-toggle' }))
  })

  it('rename dispatches dialog action via onAction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByText('Rename…'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rename' }))
  })

  it('hide dispatches dialog action via onAction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByText('Hide from console'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hide' }))
  })

  it('delete dispatches dialog action via onAction', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByText('Delete from disk…'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delete' }))
  })

  it('open-folder dispatches open-folder action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={onAction}
      />,
    )
    await user.click(screen.getByText('Open in Explorer'))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'open-folder' }))
  })

  it('calls onClose after dispatching an action', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={onClose}
        onAction={vi.fn()}
      />,
    )
    await user.click(screen.getByText('Copy path'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('all context menu actions render as menu items', () => {
    render(
      <ContextMenu
        project={makeProject()}
        isOpen={true}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    const items = screen.getAllByRole('menuitem')
    // 19 items: open-folder, open-vscode, open-claude-md, open-settings-json,
    // view-mcp, copy-path, copy-deep-link, rename, move-to-root, apply-profile,
    // pin-toggle, stop-session, launch-quick-prompt, launch-worktree,
    // resume-session, edit-env, open-claudeignore, hide, delete
    expect(items.length).toBe(19)
  })
})
