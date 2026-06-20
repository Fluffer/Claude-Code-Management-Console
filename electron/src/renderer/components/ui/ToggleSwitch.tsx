/**
 * ToggleSwitch — Fluent-ish toggle (maps to WinUI ToggleSwitch).
 * Uses role="switch" with aria-checked for accessibility.
 */
import React from 'react'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

export function ToggleSwitch({ checked, onChange, label, disabled, className = '' }: ToggleSwitchProps): React.ReactElement {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'inline-flex items-center gap-2 cursor-pointer text-sm',
        'bg-transparent border-none text-[var(--text-primary)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Track */}
      <span
        className={[
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
          checked
            ? 'bg-[var(--accent-fill)]'
            : 'bg-[var(--control-border-secondary)]',
        ].join(' ')}
        aria-hidden="true"
      >
        {/* Thumb */}
        <span
          className={[
            'inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--text-on-accent)] shadow transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-1',
          ].join(' ')}
        />
      </span>
      {label}
    </button>
  )
}
