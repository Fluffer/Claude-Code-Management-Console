/**
 * Banner — InfoBar-style horizontal strip for app-level notifications.
 * Matches WinUI InfoBar layout: icon area, title + message, action button, close button.
 * Severity controls role and color treatment.
 */
import React from 'react'
import { Button } from './Button'

export interface BannerProps {
  severity: 'info' | 'warning'
  message: string
  title?: string
  actionLabel?: string
  onAction?: () => void
  onClose?: () => void
}

export function Banner({
  severity,
  message,
  title,
  actionLabel,
  onAction,
  onClose,
}: BannerProps): React.ReactElement {
  const isWarning = severity === 'warning'

  const containerClass = isWarning
    ? 'flex items-start gap-3 px-3 py-2 rounded border border-amber-500/40 bg-amber-50/10 text-amber-900 dark:text-amber-200'
    : 'flex items-start gap-3 px-3 py-2 rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--text-primary)]'

  return (
    <div role={isWarning ? 'alert' : 'status'} className={containerClass}>
      {/* Icon */}
      <span
        className={`mt-0.5 flex-shrink-0 text-base ${isWarning ? 'text-amber-500' : 'text-[var(--accent)]'}`}
        aria-hidden="true"
      >
        {isWarning ? '⚠' : 'ℹ'}
      </span>

      {/* Text content */}
      <span className="flex-1 text-sm">
        {title && <strong className="font-semibold mr-1">{title}</strong>}
        {message}
      </span>

      {/* Action button */}
      {actionLabel != null && onAction != null && (
        <Button variant="subtle" className="flex-shrink-0 text-sm py-0.5 px-2" onClick={onAction}>
          {actionLabel}
        </Button>
      )}

      {/* Close button — only rendered when onClose is provided */}
      {onClose != null && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="flex-shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity text-sm leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}
