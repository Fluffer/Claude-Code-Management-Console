/**
 * Button — Fluent-ish button with three variants matching WinUI button styles:
 *   default  → standard control (AccentFillColor / ControlFill)
 *   accent   → prominent call-to-action (AccentButtonBackground)
 *   subtle   → ghost / low-emphasis (transparent fill)
 */
import React from 'react'

export type ButtonVariant = 'default' | 'accent' | 'subtle'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-[var(--control-fill)] border border-[var(--control-border)] text-[var(--text-primary)] hover:bg-[var(--control-fill-secondary)] active:opacity-80',
  accent:
    'btn-accent bg-[var(--accent-fill)] text-[var(--text-on-accent)] border border-transparent hover:bg-[var(--accent-fill-secondary)] active:bg-[var(--accent-fill-tertiary)]',
  subtle:
    'btn-subtle bg-transparent border border-transparent text-[var(--text-primary)] hover:bg-[var(--subtle-fill)] active:opacity-80',
}

export function Button({
  variant = 'default',
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
        'transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
