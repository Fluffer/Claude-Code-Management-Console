/**
 * Minimal toast notification system.
 * Provides ToastProvider (wraps the app) + useToast() hook for showing
 * short-lived error/info messages in the bottom-right corner.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

export type ToastVariant = 'error' | 'info'

interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  message: string
  variant: ToastVariant
  action?: ToastAction
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, variant: ToastVariant = 'error', action?: ToastAction) => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, variant, action }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none"
        >
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => {
              setToasts((prev) => prev.filter((t) => t.id !== toast.id))
            }} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}): React.ReactElement {
  useEffect(() => {
    return () => {}
  }, [])

  const bgClass =
    toast.variant === 'error'
      ? 'bg-red-600 text-white'
      : 'bg-[var(--control-fill)] text-[var(--text-primary)] border border-[var(--control-border)]'

  return (
    <div
      role="alert"
      className={[
        'pointer-events-auto flex items-center gap-2 px-3 py-2 rounded shadow-lg text-sm max-w-sm',
        bgClass,
      ].join(' ')}
    >
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick()
            onDismiss()
          }}
          className="font-semibold underline opacity-90 hover:opacity-100 flex-shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="opacity-70 hover:opacity-100 ml-1 flex-shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
