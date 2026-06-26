import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { ToastProvider } from '../../../../src/renderer/components/ui/Toast'
import { DuplicateProjectDialog } from '../../../../src/renderer/features/dialogs/DuplicateProjectDialog'
import type { ProjectInfo } from '../../../../src/core/models'

function makeProject(name: string, root: string): ProjectInfo {
  return { name, root, path: `${root}\\${name}`, lastUsedUtc: null, flags: '', description: '' }
}

const invoke = vi.fn()
beforeEach(() => {
  invoke.mockReset()
  ;(globalThis as Record<string, unknown>).window = globalThis
  ;(globalThis as { ccmc?: unknown }).ccmc = { invoke, on: () => () => {} }
})

function renderDialog(over: Partial<React.ComponentProps<typeof DuplicateProjectDialog>> = {}) {
  const project = makeProject('app', 'C:\\Dev')
  return render(
    <ToastProvider>
      <DuplicateProjectDialog
        open
        project={project}
        projects={[project]}
        roots={['C:\\Dev']}
        defaultRoot="C:\\Dev"
        isGitRepo
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        {...over}
      />
    </ToastProvider>,
  )
}

describe('DuplicateProjectDialog', () => {
  it('prefills a free -copy name', () => {
    renderDialog()
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('app-copy')
  })

  it('bumps the default name when -copy already exists', () => {
    const project = makeProject('app', 'C:\\Dev')
    renderDialog({ project, projects: [project, makeProject('app-copy', 'C:\\Dev')] })
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('app-copy-2')
  })

  it('disables the git option for a non-repo source', () => {
    renderDialog({ isGitRepo: false })
    expect((screen.getByLabelText(/git clone/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('invokes project:duplicate with the chosen mode and name', async () => {
    invoke.mockResolvedValue({ ok: true, path: 'C:\\Dev\\app-copy' })
    const onRefresh = vi.fn()
    renderDialog({ onRefresh })
    act(() => { fireEvent.click(screen.getByText('Duplicate')) })
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('project:duplicate', {
      sourcePath: 'C:\\Dev\\app', targetRoot: 'C:\\Dev', name: 'app-copy', mode: 'git',
    }))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('does not re-derive the name after a manual edit when the root changes', () => {
    const project = makeProject('app', 'C:\\Dev')
    render(
      <ToastProvider>
        <DuplicateProjectDialog
          open
          project={project}
          projects={[project]}
          roots={['C:\\Dev', 'C:\\Other']}
          defaultRoot="C:\\Dev"
          isGitRepo
          onClose={vi.fn()}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'my-experiment' } })
    fireEvent.change(screen.getByLabelText(/root/i), { target: { value: 'C:\\Other' } })
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('my-experiment')
  })

  it('closes on success and wires Open session to launch:run', async () => {
    invoke.mockResolvedValue({ ok: true, path: 'C:\\Dev\\app-copy' })
    const onClose = vi.fn()
    renderDialog({ onClose })
    act(() => { fireEvent.click(screen.getByText('Duplicate')) })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const openBtn = await screen.findByText('Open session')
    act(() => { fireEvent.click(openBtn) })
    expect(invoke).toHaveBeenCalledWith('launch:run', {
      projectName: 'app-copy',
      projectPath: 'C:\\Dev\\app-copy',
      continueSession: false,
      recordUsage: false,
    })
  })
})
