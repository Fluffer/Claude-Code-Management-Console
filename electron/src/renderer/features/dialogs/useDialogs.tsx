/**
 * useDialogs — dialog host context for the main window.
 *
 * Provides a single mount point for all dialogs so that callers can open any dialog
 * via openDialog(request) without touching App.tsx. The host renders the currently-
 * active dialog (at most one at a time) and provides an `openDialog` dispatch
 * function that callers (App's onAction switch) call to show a dialog.
 *
 * Pattern: discriminated union `DialogRequest` mirrors ProjectAction's dialog
 * variants. Each variant carries the data the dialog needs. The host renders
 * the matching component with `open={true}` and the shared `onClose`/`onRefresh`
 * callbacks.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { NewProjectDialog } from './NewProjectDialog'
import { RenameProjectDialog } from './RenameProjectDialog'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { QuickPromptDialog } from './QuickPromptDialog'
import { ResumeSessionDialog } from './ResumeSessionDialog'
import { EnvEditorDialog } from './EnvEditorDialog'
import { McpViewerDialog } from './McpViewerDialog'
import { SkillsViewerDialog } from './SkillsViewerDialog'
import { CommandPickerDialog } from './CommandPickerDialog'
import { GroupManagerDialog } from './GroupManagerDialog'
import { ProfileManagerDialog } from './ProfileManagerDialog'
import { SavedFilterDialog } from './SavedFilterDialog'
import { SettingsDialog } from './SettingsDialog'
import { WorktreePickerDialog } from './WorktreePickerDialog'
import { HelpDialog } from './HelpDialog'
import { MoveToRootDialog } from './MoveToRootDialog'
import { CloneRepoDialog } from './CloneRepoDialog'
import { CommitDialog } from './CommitDialog'
import { OpenPrDialog } from './OpenPrDialog'
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
  | { kind: 'edit-env'; project: ProjectInfo }
  | { kind: 'view-mcp'; project: ProjectInfo }
  | { kind: 'view-skills'; project: ProjectInfo }
  | { kind: 'run-command'; project: ProjectInfo }
  | { kind: 'manage-groups'; projects: ProjectInfo[] }
  | { kind: 'manage-profiles' }
  | { kind: 'manage-filters' }
  | { kind: 'settings' }
  | { kind: 'pick-worktree'; project: ProjectInfo }
  | { kind: 'help' }
  | { kind: 'move-to-root'; project: ProjectInfo }
  | { kind: 'clone'; roots: string[]; defaultRoot: string | null }
  | { kind: 'commit'; project: ProjectInfo }
  | { kind: 'open-pr'; project: ProjectInfo }

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface DialogsContextValue {
  openDialog: (request: DialogRequest) => void
  /**
   * Register the handler run when a dialog reports it mutated data.
   * MainWindow registers a combined refresh (projects + state + config) here;
   * the provider sits above MainWindow so it cannot reach those hooks directly.
   */
  registerRefresh: (handler: () => void) => void
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
  // Default to the prop; MainWindow overrides via registerRefresh once mounted.
  const onRefreshRef = useRef(onRefresh)

  const openDialog = useCallback((request: DialogRequest) => {
    setActive(request)
  }, [])

  const registerRefresh = useCallback((handler: () => void) => {
    onRefreshRef.current = handler
  }, [])

  const handleClose = useCallback(() => setActive(null), [])
  const handleRefresh = useCallback(() => onRefreshRef.current(), [])

  return (
    <DialogsContext.Provider value={{ openDialog, registerRefresh }}>
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

      {active?.kind === 'edit-env' && (
        <EnvEditorDialog
          open={true}
          project={active.project}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'view-mcp' && (
        <McpViewerDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'view-skills' && (
        <SkillsViewerDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'run-command' && (
        <CommandPickerDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'manage-groups' && (
        <GroupManagerDialog
          open={true}
          projects={active.projects}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'manage-profiles' && (
        <ProfileManagerDialog
          open={true}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'manage-filters' && (
        <SavedFilterDialog
          open={true}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'settings' && (
        <SettingsDialog
          open={true}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'pick-worktree' && (
        <WorktreePickerDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'help' && (
        <HelpDialog
          open={true}
          onClose={handleClose}
        />
      )}

      {active?.kind === 'move-to-root' && (
        <MoveToRootDialog
          open={true}
          project={active.project}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'clone' && (
        <CloneRepoDialog
          open={true}
          roots={active.roots}
          defaultRoot={active.defaultRoot}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'commit' && (
        <CommitDialog
          open={true}
          project={active.project}
          onClose={handleClose}
          onRefresh={handleRefresh}
        />
      )}

      {active?.kind === 'open-pr' && (
        <OpenPrDialog
          open={true}
          project={active.project}
          onClose={handleClose}
        />
      )}
    </DialogsContext.Provider>
  )
}
