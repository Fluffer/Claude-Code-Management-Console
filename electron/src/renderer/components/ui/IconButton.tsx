/**
 * IconButton — small icon-only button with an accessible aria-label.
 * Maps to WinUI AppBarButton / transparent Button with FontIcon.
 */
import React from 'react'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
}

export function IconButton({ children, className = '', type = 'button', ...props }: IconButtonProps): React.ReactElement {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center w-8 h-8 rounded',
        'bg-transparent border-none text-[var(--text-primary)]',
        'hover:bg-[var(--subtle-fill)] active:opacity-80',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-40 disabled:pointer-events-none transition-colors duration-100',
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
