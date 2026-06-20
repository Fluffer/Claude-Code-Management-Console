/**
 * Modal — Fluent ContentDialog-style modal primitive.
 *
 * A11y features:
 *  - role="dialog" + aria-modal="true" + aria-labelledby (title)
 *  - Focus trap: Tab/Shift+Tab cycle within the dialog
 *  - Focus moves into dialog on open; restores to trigger element on close
 *  - Escape closes the dialog
 *  - Backdrop click closes the dialog (configurable via closeOnBackdrop)
 *  - Body scroll lock while open
 *
 * The `useModal` promise helper is exported for await-style callers.
 */
import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Focus trap helpers
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  /** Close when backdrop is clicked. Default: true. */
  closeOnBackdrop?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
}: ModalProps): React.ReactElement | null {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Focus management: save trigger, move focus in, restore on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement

      // Move focus into the dialog synchronously so tests and screen readers
      // see the focus move immediately upon open.
      if (dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current)
        if (focusable.length > 0) {
          focusable[0].focus()
        } else {
          dialogRef.current.focus()
        }
      }
    } else {
      // Restore focus to the element that triggered the dialog
      const prev = previousFocusRef.current
      if (prev && prev instanceof HTMLElement) {
        prev.focus()
      }
      previousFocusRef.current = null
    }
  }, [open])

  // Keyboard handling: Escape closes; Tab is trapped
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current)
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose()
    }
  }

  const content = (
    /* Backdrop */
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--smoke)]"
      onClick={handleBackdropClick}
    >
      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          'relative z-10 w-full max-w-md rounded-lg shadow-xl',
          'bg-[var(--acrylic-bg)] border border-[var(--flyout-border)]',
          'flex flex-col outline-none',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="px-6 pt-5 pb-3 border-b border-[var(--divider)]">
          <h2
            id={titleId}
            className="text-base font-semibold text-[var(--text-primary)] leading-snug"
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 text-sm text-[var(--text-primary)] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 pt-3 border-t border-[var(--divider)] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

// ---------------------------------------------------------------------------
// useModal — promise-based helper for imperative callers
// ---------------------------------------------------------------------------

export interface ModalResult<T> {
  open: boolean
  resolve: (value: T) => void
  onClose: () => void
}

/**
 * Promise-based wrapper around Modal state.
 * Usage: const { openModal, modalProps } = useModal<boolean>()
 *        const confirmed = await openModal()
 */
export function useModal<T = void>(): {
  openModal: () => Promise<T>
  isOpen: boolean
  modalProps: { open: boolean; onClose: () => void }
} {
  const [isOpen, setIsOpen] = React.useState(false)
  const resolveRef = useRef<((value: T) => void) | null>(null)

  const openModal = (): Promise<T> => {
    setIsOpen(true)
    return new Promise<T>((resolve) => {
      resolveRef.current = resolve
    })
  }

  const onClose = (): void => {
    setIsOpen(false)
    resolveRef.current?.(undefined as unknown as T)
    resolveRef.current = null
  }

  return {
    openModal,
    isOpen,
    modalProps: { open: isOpen, onClose },
  }
}
