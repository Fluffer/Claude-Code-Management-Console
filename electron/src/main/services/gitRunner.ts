import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { GitWorktree } from '../../core/models'
import { parseWorktrees, readBranchFromHead, parseGitFileRedirect } from '../../core/git/gitOutputParser'
import { siblingWorktreePath } from '../../core/git/worktreePath'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 2000
// Worktree creation checks out a working tree, so it can take longer than the
// read-only queries above.
const GIT_WORKTREE_ADD_TIMEOUT_MS = 15000

/**
 * Spawns `git worktree list --porcelain` and returns parsed GitWorktree[].
 * Returns [] if git is unavailable or the path is not a git repo.
 * Ported from GitWorktreeProvider.ListAsync (C#).
 */
export async function getWorktrees(repoPath: string): Promise<GitWorktree[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['worktree', 'list', '--porcelain'],
      {
        cwd: repoPath,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      }
    )
    return parseWorktrees(stdout)
  } catch {
    return []
  }
}

/**
 * Creates a new git worktree with a new branch, forked from the repo's current
 * HEAD, in a sibling folder (`<repo>-<branch-slug>`).
 *
 * Spawns `git -C <repo> worktree add -b <branch> <path> HEAD`. Returns the
 * resolved path on success; on failure returns the git stderr as `error`
 * (folder exists, branch exists, not a repo) without throwing.
 */
export async function addWorktree(
  repoPath: string,
  branch: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const target = siblingWorktreePath(repoPath, branch)
  try {
    await execFileAsync(
      'git',
      ['worktree', 'add', '-b', branch, target, 'HEAD'],
      {
        cwd: repoPath,
        timeout: GIT_WORKTREE_ADD_TIMEOUT_MS,
        windowsHide: true,
      }
    )
    return { ok: true, path: target }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    const message =
      stderr && stderr.trim().length > 0
        ? stderr.trim()
        : err instanceof Error
          ? err.message
          : String(err)
    return { ok: false, error: message }
  }
}

/**
 * Reads branch from .git/HEAD without spawning a process.
 * Handles worktree .git-file redirects.
 * Returns null if not a git repo or HEAD unreadable.
 * Ported from GitInfoProvider.ReadBranchFromHead (C#) — the I/O part.
 */
export async function getBranchInfo(projectPath: string): Promise<string | null> {
  try {
    const gitDir = await resolveGitDir(projectPath)
    if (gitDir === null) return null

    const headFile = path.join(gitDir, 'HEAD')
    const headContent = await fs.readFile(headFile, 'utf8').catch(() => null)
    if (headContent === null) return null

    return readBranchFromHead(headContent)
  } catch {
    return null
  }
}

/**
 * Spawns `git status --porcelain` and returns true if there are uncommitted changes,
 * false if clean, or null if git failed / not a git repo.
 * Ported from GitInfoProvider.IsDirtyAsync (C#).
 */
export async function getIsDirty(projectPath: string): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain'],
      {
        cwd: projectPath,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      }
    )
    return stdout.length > 0
  } catch {
    return null
  }
}

/**
 * Resolves the .git directory for a project path.
 * Returns the gitdir path, or null if not a git repo.
 */
async function resolveGitDir(projectPath: string): Promise<string | null> {
  const gitPath = path.join(projectPath, '.git')
  try {
    const stat = await fs.stat(gitPath)
    if (stat.isDirectory()) return gitPath

    if (stat.isFile()) {
      // Worktree: .git is a file containing "gitdir: <path>"
      const content = await fs.readFile(gitPath, 'utf8')
      const redirected = parseGitFileRedirect(content)
      if (redirected === null) return null
      return path.isAbsolute(redirected)
        ? redirected
        : path.resolve(projectPath, redirected)
    }
  } catch {
    return null
  }
  return null
}
