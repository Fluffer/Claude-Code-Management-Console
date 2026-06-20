import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { EnvEditorDialog } from '../../../../src/renderer/features/dialogs/EnvEditorDialog'
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

const ENV_CONTENT = '# comment\nAPI_KEY=secret\nDEBUG=true\n'

describe('EnvEditorDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('env:read', ENV_CONTENT)
    setChannelResponse('env:write', null as unknown as void)
  })

  it('renders the dialog title', async () => {
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    expect(screen.getByText(/\.env — my-project/i)).toBeInTheDocument()
  })

  it('loads and displays env keys from env:read', async () => {
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => {
      expect(screen.getByText('API_KEY')).toBeInTheDocument()
      expect(screen.getByText('DEBUG')).toBeInTheDocument()
    })
  })

  it('masks values by default (password type)', async () => {
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    const inputs = screen.getAllByDisplayValue('')
    // password inputs don't show values — check that type="password" inputs exist
    const passwordInputs = document.querySelectorAll('input[type="password"]')
    expect(passwordInputs.length).toBeGreaterThan(0)
  })

  it('can reveal a value via toggle', async () => {
    const user = userEvent.setup()
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    const revealBtn = screen.getByLabelText(/Reveal API_KEY/i)
    await user.click(revealBtn)
    const textInputs = document.querySelectorAll('input[type="text"]')
    // at least one text input should appear after reveal
    expect(textInputs.length).toBeGreaterThan(0)
  })

  it('can remove a key', async () => {
    const user = userEvent.setup()
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    const removeBtn = screen.getByLabelText(/Remove API_KEY/i)
    await user.click(removeBtn)
    expect(screen.queryByText('API_KEY')).not.toBeInTheDocument()
  })

  it('can add a new key', async () => {
    const user = userEvent.setup()
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    await user.type(screen.getByLabelText(/New key name/i), 'NEW_VAR')
    await user.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(screen.getByText('NEW_VAR')).toBeInTheDocument()
  })

  it('Save calls env:write with updated content preserving comments', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <EnvEditorDialog open={true} project={project} onClose={onClose} onRefresh={onRefresh} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('env:write', expect.objectContaining({
        path: project.path,
      }))
    })
    // Comment should be preserved in written content
    const invoke = getMockInvoke()
    const writeCall = invoke.mock.calls.find((c: unknown[]) => c[0] === 'env:write')
    expect(writeCall).toBeDefined()
    expect((writeCall as unknown[])[1]).toMatchObject({ path: project.path })
    const contents = ((writeCall as unknown[])[1] as { contents: string }).contents
    expect(contents).toContain('# comment')
    expect(contents).toContain('API_KEY=secret')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('removing a key then saving excludes it from output', async () => {
    const user = userEvent.setup()
    render(
      <EnvEditorDialog open={true} project={project} onClose={vi.fn()} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    await user.click(screen.getByLabelText(/Remove API_KEY/i))
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      const writeCall = invoke.mock.calls.find((c: unknown[]) => c[0] === 'env:write')
      const contents = (writeCall![1] as { contents: string }).contents
      expect(contents).not.toContain('API_KEY')
      expect(contents).toContain('DEBUG=true')
    })
  })

  it('Cancel closes without calling env:write', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <EnvEditorDialog open={true} project={project} onClose={onClose} onRefresh={vi.fn()} />,
    )
    await waitFor(() => screen.getByText('API_KEY'))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('env:write', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <EnvEditorDialog open={true} project={project} onClose={onClose} onRefresh={vi.fn()} />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
