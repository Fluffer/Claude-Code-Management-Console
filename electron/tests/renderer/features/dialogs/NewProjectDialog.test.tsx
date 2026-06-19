import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { NewProjectDialog } from '../../../../src/renderer/features/dialogs/NewProjectDialog'

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

describe('NewProjectDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('config:read', {
      roots: ['/r1', '/r2'],
      defaultRoot: '/r1',
      ignore: null,
      hidden: null,
      projects: null,
    })
    setChannelResponse('projects:scan', [])
    setChannelResponse('dialog:pickFolder', { path: null })
  })

  it('renders the dialog title and fields', () => {
    render(
      <NewProjectDialog
        open={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        roots={['/r1', '/r2']}
      />,
    )
    expect(screen.getByText('New Project')).toBeInTheDocument()
    expect(screen.getByLabelText(/project name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/create in/i)).toBeInTheDocument()
  })

  it('Create button is disabled when name is empty', () => {
    render(
      <NewProjectDialog
        open={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        roots={['/r1']}
      />,
    )
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()
  })

  it('shows validation error when name has invalid characters', async () => {
    const user = userEvent.setup()
    render(
      <NewProjectDialog
        open={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        roots={['/r1']}
      />,
    )
    await user.type(screen.getByLabelText(/project name/i), 'bad:name')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toMatch(/invalid characters/i)
  })

  it('calls dialog:pickFolder when Browse button clicked', async () => {
    const user = userEvent.setup()
    render(
      <NewProjectDialog
        open={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        roots={['/r1']}
      />,
    )
    await user.click(screen.getByRole('button', { name: /browse/i }))
    const invoke = getMockInvoke()
    expect(invoke).toHaveBeenCalledWith('dialog:pickFolder', expect.anything())
  })

  it('valid name + root calls projects:scan on submit', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    // No IPC for folder creation — we use projects:scan after
    setChannelResponse('projects:scan', [])
    render(
      <NewProjectDialog
        open={true}
        onClose={onClose}
        onRefresh={onRefresh}
        roots={['/r1']}
      />,
    )
    await user.type(screen.getByLabelText(/project name/i), 'my-new-project')
    const createBtn = screen.getByRole('button', { name: /create/i })
    await waitFor(() => expect(createBtn).not.toBeDisabled())
    await user.click(createBtn)
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('projects:scan', expect.anything())
    })
  })

  it('Cancel closes without side effects', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <NewProjectDialog
        open={true}
        onClose={onClose}
        onRefresh={vi.fn()}
        roots={['/r1']}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('projects:scan', expect.anything())
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <NewProjectDialog
        open={true}
        onClose={onClose}
        onRefresh={vi.fn()}
        roots={['/r1']}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
