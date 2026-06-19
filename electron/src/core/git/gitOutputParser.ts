import type { GitWorktree } from '../models'

/**
 * Parses `git worktree list --porcelain` stdout into GitWorktree records.
 * Pure function — no I/O. Handles both \r\n and \n line endings.
 * Ported from GitWorktreeProvider.Parse (C#).
 */
export function parseWorktrees(output: string): GitWorktree[] {
  const result: GitWorktree[] = []

  let path: string | null = null
  let branch: string | null = null
  let isDetached = false
  let isBare = false

  function flush(): void {
    if (path !== null) {
      result.push({ path, branch, isDetached, isBare })
    }
    path = null
    branch = null
    isDetached = false
    isBare = false
  }

  const lines = output.replace(/\r\n/g, '\n').split('\n')

  for (const raw of lines) {
    const line = raw.trim()
    if (line.length === 0) {
      flush()
      continue
    }
    if (line.startsWith('worktree ')) {
      path = line.slice('worktree '.length).trim()
    } else if (line === 'bare') {
      isBare = true
    } else if (line === 'detached') {
      isDetached = true
    } else if (line.startsWith('branch ')) {
      const refName = line.slice('branch '.length).trim()
      const prefix = 'refs/heads/'
      branch = refName.startsWith(prefix) ? refName.slice(prefix.length) : refName
    }
  }

  flush()
  return result
}

/**
 * Parses the text content of a `.git/HEAD` file and returns the branch name
 * or short commit hash. Returns null for empty/blank content.
 * Ported from GitInfoProvider.ReadBranchFromHead (C#) — the pure parsing part.
 * File I/O is deferred to the main process (Phase 3).
 */
export function readBranchFromHead(headContent: string): string | null {
  const head = headContent.trim()
  if (head.length === 0) return null

  const refPrefix = 'ref: refs/heads/'
  if (head.startsWith(refPrefix)) {
    return head.slice(refPrefix.length)
  }

  // Detached HEAD: return a short hash (7 chars minimum, or full if shorter).
  return head.length >= 7 ? head.slice(0, 7) : head
}

/**
 * Parses the content of a worktree `.git` file (which contains "gitdir: <path>")
 * and returns the gitdir path, or null if not found.
 * Pure — no fs access. Used by the main process to resolve worktree git dirs.
 */
export function parseGitFileRedirect(gitFileContent: string): string | null {
  const lines = gitFileContent.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    if (line.startsWith('gitdir:')) {
      return line.slice('gitdir:'.length).trim()
    }
  }
  return null
}
