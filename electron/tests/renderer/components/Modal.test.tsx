import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Modal } from '../../../src/renderer/components/ui/Modal'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  return render(
    <Modal open={true} title="Test Dialog" onClose={onClose} {...props}>
      <p>Modal content</p>
    </Modal>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Modal', () => {
  afterEach(() => {
    // Restore body overflow if Modal set it
    document.body.style.overflow = ''
  })

  it('renders nothing when open=false', () => {
    render(
      <Modal open={false} title="Hidden" onClose={vi.fn()}>
        <p>content</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders a dialog with correct role and aria-modal when open=true', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('labels the dialog with the title via aria-labelledby', () => {
    renderModal({ title: 'My Dialog' })
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    // The element referenced by aria-labelledby should contain the title text
    const titleEl = document.getElementById(labelledBy!)
    expect(titleEl).not.toBeNull()
    expect(titleEl!.textContent).toBe('My Dialog')
  })

  it('moves focus into the dialog on open', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    // At least one focusable element inside dialog should receive focus,
    // or the dialog itself if no focusable child exists
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ onClose })
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ onClose })
    // The backdrop is the outermost element (not the dialog panel)
    const backdrop = document.querySelector('[data-testid="modal-backdrop"]')
    expect(backdrop).not.toBeNull()
    await user.click(backdrop!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when the panel itself is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal({ onClose })
    const dialog = screen.getByRole('dialog')
    await user.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders the title text', () => {
    renderModal({ title: 'Confirm Delete' })
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderModal()
    expect(screen.getByText('Modal content')).toBeInTheDocument()
  })

  it('renders an optional footer', () => {
    render(
      <Modal open={true} title="T" onClose={vi.fn()} footer={<button>Save</button>}>
        content
      </Modal>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('traps Tab focus within the dialog', async () => {
    const user = userEvent.setup()
    render(
      <Modal open={true} title="Trap" onClose={vi.fn()}>
        <button>First</button>
        <button>Second</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    const buttons = within(dialog).getAllByRole('button')
    // Tab should cycle within the dialog
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    // Shift+Tab should also stay inside
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    void buttons // suppress unused variable lint
  })

  it('locks body scroll when open', () => {
    renderModal()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body scroll when closed', () => {
    const { rerender } = renderModal({ open: true })
    expect(document.body.style.overflow).toBe('hidden')
    rerender(
      <Modal open={false} title="T" onClose={vi.fn()}>
        content
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('')
  })

  it('restores focus to the trigger element on close', async () => {
    const user = userEvent.setup()
    // Render a trigger button outside the modal
    function Wrapper(): React.ReactElement {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} title="Dialog" onClose={() => setOpen(false)}>
            <button>Inside</button>
          </Modal>
        </>
      )
    }
    render(<Wrapper />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await user.click(trigger)
    // Dialog is open; now close it with Escape
    await user.keyboard('{Escape}')
    // Focus should return to the trigger
    expect(document.activeElement).toBe(trigger)
  })
})
