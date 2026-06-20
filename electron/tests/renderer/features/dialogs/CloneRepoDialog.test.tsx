import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { installMockCcmc, setChannelResponse, getMockInvoke } from '../../mockCcmc'
import { CloneRepoDialog } from '../../../../src/renderer/features/dialogs/CloneRepoDialog'

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

describe('CloneRepoDialog', () => {
  beforeEach(() => {
    mockMatchMedia()
    installMockCcmc()
    setChannelResponse('git:clone', { ok: true, path: '/r1/my-repo' })
    setChannelResponse('launch:run', { ok: true, pid: 1234 })
  })

  it('renders title and fields', () => {
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1', '/r2']}
        defaultRoot="/r1"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText('Clone Repository')).toBeInTheDocument()
    expect(screen.getByLabelText(/repository url/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/folder name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/clone into/i)).toBeInTheDocument()
  })

  it('Clone button disabled when URL is empty', () => {
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /^Clone$/i })).toBeDisabled()
  })

  it('prefills name from URL as user types', async () => {
    const user = userEvent.setup()
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/repository url/i), 'https://github.com/me/my-repo.git')
    await waitFor(() => {
      expect((screen.getByLabelText(/folder name/i) as HTMLInputElement).value).toBe('my-repo')
    })
  })

  it('invalid name disables Clone and shows error', async () => {
    const user = userEvent.setup()
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/repository url/i), 'https://github.com/me/foo.git')
    // Clear the prefilled name then type an invalid one
    const nameInput = screen.getByLabelText(/folder name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'bad:name')
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Clone$/i })).toBeDisabled()
    })
  })

  it('successful clone calls launch:run with recordUsage false then onRefresh and onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={onClose}
        onRefresh={onRefresh}
      />,
    )
    await user.type(screen.getByLabelText(/repository url/i), 'https://github.com/me/my-repo.git')
    await waitFor(() => {
      expect((screen.getByLabelText(/folder name/i) as HTMLInputElement).value).toBe('my-repo')
    })
    await user.click(screen.getByRole('button', { name: /^Clone$/i }))
    await waitFor(() => {
      const invoke = getMockInvoke()
      expect(invoke).toHaveBeenCalledWith('git:clone', {
        url: 'https://github.com/me/my-repo.git',
        targetRoot: '/r1',
        name: 'my-repo',
      })
      expect(invoke).toHaveBeenCalledWith('launch:run', expect.objectContaining({
        projectName: 'my-repo',
        projectPath: '/r1/my-repo',
        continueSession: false,
        recordUsage: false,
      }))
    })
    expect(onRefresh).toHaveBeenCalled()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('clone error stays open and shows message', async () => {
    setChannelResponse('git:clone', { ok: false, error: 'Repository not found' })
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/repository url/i), 'https://github.com/me/my-repo.git')
    await waitFor(() => {
      expect((screen.getByLabelText(/folder name/i) as HTMLInputElement).value).toBe('my-repo')
    })
    await user.click(screen.getByRole('button', { name: /^Clone$/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Repository not found')
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('manual name edit is not overwritten by URL change', async () => {
    const user = userEvent.setup()
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    const nameInput = screen.getByLabelText(/folder name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'my-custom-name')
    // Now type in the URL field — name should not change
    await user.type(screen.getByLabelText(/repository url/i), 'https://github.com/me/other-repo.git')
    expect((screen.getByLabelText(/folder name/i) as HTMLInputElement).value).toBe('my-custom-name')
  })

  it('Cancel closes without cloning', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CloneRepoDialog
        open={true}
        roots={['/r1']}
        defaultRoot="/r1"
        onClose={onClose}
        onRefresh={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(getMockInvoke()).not.toHaveBeenCalledWith('git:clone', expect.anything())
  })
})
