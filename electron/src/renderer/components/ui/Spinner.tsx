/**
 * Spinner — Fluent-ish indeterminate progress ring (maps to WinUI ProgressRing).
 */
import React from 'react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const SIZE_CLASSES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-[3px]',
}

export function Spinner({ size = 'md', className = '', label = 'Loading…' }: SpinnerProps): React.ReactElement {
  return (
    <span role="status" aria-label={label} className={['inline-flex', className].join(' ')}>
      <span
        aria-hidden="true"
        className={[
          'rounded-full border-[var(--subtle-fill)] border-t-[var(--accent)] animate-spin',
          SIZE_CLASSES[size],
        ].join(' ')}
      />
    </span>
  )
}
