/**
 * TextInput — Fluent-ish single-line text input (maps to WinUI TextBox).
 *
 * Forwards its ref to the underlying <input> so callers can focus it
 * programmatically (the search box does this for Ctrl+F).
 */
import React from 'react'

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, className = '', ...props },
  ref,
): React.ReactElement {
  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        'w-full rounded px-3 py-1.5 text-sm',
        'bg-[var(--control-fill)] border border-[var(--control-border)]',
        'text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]',
        'focus:outline focus:outline-2 focus:outline-[var(--accent)] focus:border-transparent',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
})
