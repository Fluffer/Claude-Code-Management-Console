import { describe, it, expect } from 'vitest'
import type { ProjectAction, ActionContext } from '../../../../src/renderer/features/projects/projectActions'

describe('ProjectAction union', () => {
  it('exports the expected action kinds', () => {
    const actions: ProjectAction['kind'][] = [
      'launch-continue',
      'launch-new',
      'launch-quick-prompt',
      'launch-worktree',
      'stop-session',
      'pin-toggle',
      'rename',
      'move-to-root',
      'apply-profile',
      'hide',
      'delete',
      'copy-path',
      'copy-deep-link',
      'open-folder',
      'open-vscode',
      'open-claude-md',
      'open-settings-json',
      'open-claudeignore',
      'view-mcp',
      'edit-env',
      'resume-session',
    ]
    expect(actions.length).toBe(21)
  })

  it('ActionContext type has onAction callback', () => {
    const ctx: ActionContext = {
      onAction: (_action) => {},
    }
    expect(typeof ctx.onAction).toBe('function')
  })
})
