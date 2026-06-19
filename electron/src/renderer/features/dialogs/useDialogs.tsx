/**
 * useDialogs — dialog host context for the main window.
 *
 * Provides a single mount point for all dialogs so that batch 4N can add
 * more dialogs without touching App.tsx. The host renders the currently-
 * active dialog (at most one at a time) and provides an `openDialog` dispatch
 * function that callers (App's onAction switch) call to show a dialog.
 *
 * Pattern: discriminated union `DialogRequest` mirrors ProjectAction's dialog
 * variants. Each variant carries the data the dialog needs. The host renders
 * the matching component with `open={true}` and the shared `onClose`/`onRefresh`
 * callbacks.
 *
 * Extensibility for batch 4N: add a new variant to DialogRequest, add a case
 * in the host's render switch, and add a case in `openDialog`. Zero App.tsx
 * changes required.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { NewProjectDialog } from './NewProjectDialog'
import { RenameProjectDialog } from './RenameProjectDialog'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { QuickPromptDialog } from './QuickPromptDialog'
import { ResumeSessionDialog } from './ResumeSessionDialog'
import type { ProjectInfo } from '../../../core/models'

// ---------------------------------------------------------------------------
// Dialog request union
// ---------------------------------------------------------------------------

export type DialogRequest =
  | { kind: 'new-project'; roots: string[] }
  | { kind: 'rename'; project: ProjectInfo }
  | { kind: 'delete'; project: ProjectInfo; gitDirty: boolean | null; isRunning: boolean }
  | { kind: 'quick-prompt'; project: ProjectInfo }
  | { kind: 'resume-session'; project: ProjectInfo }

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DialogsContextValue {
  openDialog: (request: DialogRequest) => void
}

const DialogsContext = createContext<DialogsContextValue | null>(null)

export function useDialogs(): DialogsContextValue {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useDialogs must be used within DialogsProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Provider + host
// ---------------------------------------------------------------------------

interface DialogsProviderProps {
  children: React.ReactNode
  onRefresh: () => void
}

export function DialogsProvider({
  children,
  onRefresh,
}: DialogsProviderProps): React.ReactElement {
  const [active, setActive] = useState<DialogRequest | null>(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const openDialog = useCallback((request: DialogRequest) => {
    setActive(request)
  }, [])

  const handleClose = useCallback(() => setActive(null), [])
  const handleRefresh = useCallback(() => onRefreshRef.current(), [])

  return (
    <DialogsContext.Provider value={{ openDialog }}>
      {children}

      {/* Dialog host — only one dialog open at a time */}
      {active?.kind === 'new-project' && (
        <NewProjectDialog
          open={true}
          roots={active.roots}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'rename' && (
        <RenameProjectDialog
          open={true}
          project={active.project}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'delete' && (
        <DeleteProjectDialog
          open={true}
          project={active.project}
          gitDirty={active.gitDirty}
          isRunning={active.isRunning}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'quick-prompt' && (
        <QuickPromptDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'resume-session' && (
        <ResumeSessionDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}
    </DialogsContext.Provider>
  )
}
