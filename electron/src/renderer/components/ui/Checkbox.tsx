/**
 * Checkbox — Fluent-ish checkbox (maps to WinUI CheckBox).
 */
import React, { useId } from 'react'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

export function Checkbox({ checked, onChange, label, disabled, className = '' }: CheckboxProps): React.ReactElement {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={[
        'inline-flex items-center gap-2 cursor-pointer select-none text-sm',
        'text-[var(--text-primary)]',
        disabled ? 'opacity-40 pointer-events-none' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
      />
      {label}
    </label>
  )
}
