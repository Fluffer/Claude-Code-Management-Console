import React from 'react'

interface DropOverlayProps {
  show: boolean
}

/**
 * Full-area translucent overlay shown while a drag is in progress.
 * pointer-events-none so drag events fall through to the root container
 * (which handles onDragOver / onDrop). Rendered above all content via z-index.
 */
export function DropOverlay({ show }: DropOverlayProps): React.ReactElement | null {
  if (!show) return null

  return (
    <div
      aria-hidden="true"
      className={[
        'absolute inset-0 z-40 flex items-center justify-center',
        'bg-[var(--accent-fill)] bg-opacity-20 pointer-events-none',
        'border-4 border-dashed border-[var(--accent-fill)] rounded-lg',
      ].join(' ')}
    >
      <p className="text-lg font-semibold text-[var(--text-primary)] select-none px-6 py-4 rounded-lg bg-[var(--surface)] shadow-lg">
        Drop a folder to add it as a source root
      </p>
    </div>
  )
}
