import type { ProjectInfo } from '../../../core/models'

/**
 * Discriminated union of every action the project context menu / command bar can dispatch.
 *
 * Direct-IPC actions (launch-continue, launch-new, pin-toggle, stop-session,
 * copy-path, copy-deep-link, open-folder) are handled inline in App's dispatcher.
 *
 * Dialog actions (rename, move-to-root, apply-profile, hide, delete, edit-env,
 * open-claude-md, open-settings-json, open-claudeignore, view-mcp,
 * launch-quick-prompt, launch-worktree, resume-session, open-vscode)
 * are forwarded via ActionContext.onAction so dialog batches (4M/4N) can handle them.
 */
export type ProjectAction =
  | { kind: 'launch-continue'; project: ProjectInfo }
  | { kind: 'launch-new'; project: ProjectInfo }
  | { kind: 'launch-quick-prompt'; project: ProjectInfo }
  | { kind: 'launch-worktree'; project: ProjectInfo }
  | { kind: 'stop-session'; project: ProjectInfo }
  | { kind: 'pin-toggle'; project: ProjectInfo }
  | { kind: 'rename'; project: ProjectInfo }
  | { kind: 'move-to-root'; project: ProjectInfo }
  | { kind: 'apply-profile'; project: ProjectInfo }
  | { kind: 'hide'; project: ProjectInfo }
  | { kind: 'delete'; project: ProjectInfo }
  | { kind: 'copy-path'; project: ProjectInfo }
  | { kind: 'copy-deep-link'; project: ProjectInfo }
  | { kind: 'open-folder'; project: ProjectInfo }
  | { kind: 'open-vscode'; project: ProjectInfo }
  | { kind: 'open-claude-md'; project: ProjectInfo }
  | { kind: 'open-settings-json'; project: ProjectInfo }
  | { kind: 'open-claudeignore'; project: ProjectInfo }
  | { kind: 'view-mcp'; project: ProjectInfo }
  | { kind: 'edit-env'; project: ProjectInfo }
  | { kind: 'resume-session'; project: ProjectInfo }
  | { kind: 'set-model'; project: ProjectInfo; model: string | null }
  | { kind: 'commit'; project: ProjectInfo }
  | { kind: 'open-pr'; project: ProjectInfo }

/**
 * Context passed down the component tree so any component can dispatch a ProjectAction.
 * Direct-IPC actions are handled inside the dispatcher itself.
 * Dialog actions are forwarded to the caller (App) which will render the dialog.
 */
export interface ActionContext {
  onAction: (action: ProjectAction) => void
}
