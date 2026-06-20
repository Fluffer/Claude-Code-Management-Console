import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse } from '../../mockCcmc'
import { McpViewerDialog } from '../../../../src/renderer/features/dialogs/McpViewerDialog'
import type { ProjectInfo } from '../../../../src/core/models'

function mockMatchMedia(): void {
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
}

const project: ProjectInfo = {
  name: 'my-project',
  root: '/r1',
  path: '/r1/my-project',
  lastUsedUtc: null,
  flags: '',
  description: '',
}

describe('McpViewerDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('mcp:read', [
      { name: 'filesystem', transport: 'stdio' },
      { name: 'memory', transport: 'http' },
    ])
  })

  it('renders the dialog title', () => {
    render(
      <McpViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/MCP servers — my-project/i)).toBeInTheDocument()
  })

  it('displays server list from mcp:read', async () => {
    render(
      <McpViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeInTheDocument()
      expect(screen.getByText('memory')).toBeInTheDocument()
      expect(screen.getByText('stdio')).toBeInTheDocument()
      expect(screen.getByText('http')).toBeInTheDocument()
    })
  })

  it('shows empty state when no servers', async () => {
    setChannelResponse('mcp:read', [])
    render(
      <McpViewerDialog open={true} project={project} onClose={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText(/No MCP servers configured/i)).toBeInTheDocument()
    })
  })

  it('Close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <McpViewerDialog open={true} project={project} onClose={onClose} />,
    )
    await waitFor(() => screen.getByRole('button', { name: /close/i }))
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <McpViewerDialog open={true} project={project} onClose={onClose} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
