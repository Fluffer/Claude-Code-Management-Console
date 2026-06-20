import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { GitWorktree } from '../../core/models'
import { parseWorktrees, readBranchFromHead, parseGitFileRedirect } from '../../core/git/gitOutputParser'
import { siblingWorktreePath } from '../../core/git/worktreePath'
import { parsePrUrl } from '../../core/git/prUrl'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 2000
// Worktree creation checks out a working tree, so it can take longer than the
// read-only queries above.
const GIT_WORKTREE_ADD_TIMEOUT_MS = 15000
// Network operations (clone, push, pr) may be slow on large repos.
const GIT_NETWORK_TIMEOUT_MS = 120000
// Local commit operation.
const GIT_COMMIT_TIMEOUT_MS = 30000

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
 * Clones a git URL into targetDir.
 * Pre-checks: if targetDir already exists, returns an error without cloning.
 * cwd is set to the parent of targetDir so git creates the folder itself.
 * Never throws.
 */
export async function cloneRepo(
  url: string,
  targetDir: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    await fs.stat(targetDir)
    return { ok: false, error: `Target folder already exists: ${targetDir}` }
  } catch {
    // stat threw → folder does not exist → safe to clone
  }

  const parent = path.dirname(targetDir)
  try {
    await execFileAsync('git', ['clone', '--', url, targetDir], {
      cwd: parent,
      timeout: GIT_NETWORK_TIMEOUT_MS,
      windowsHide: true,
    })
    return { ok: true, path: targetDir }
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
 * Stages all changes, commits with the given message, and optionally pushes.
 * Returns { ok: true } on success. On any step failure, returns { ok: false,
 * error } with the stderr (or message) from the failing command.
 * Never throws.
 */
export async function commitAll(
  repoPath: string,
  message: string,
  push: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const extractError = (err: unknown): string => {
    const asErr = err as { stderr?: string; stdout?: string }
    const text = asErr.stderr?.trim() || asErr.stdout?.trim()
    if (text && text.length > 0) return text
    return err instanceof Error ? err.message : String(err)
  }

  try {
    await execFileAsync('git', ['add', '-A'], {
      cwd: repoPath,
      timeout: GIT_COMMIT_TIMEOUT_MS,
      windowsHide: true,
    })
  } catch (err) {
    return { ok: false, error: extractError(err) }
  }

  try {
    await execFileAsync('git', ['commit', '-m', message], {
      cwd: repoPath,
      timeout: GIT_COMMIT_TIMEOUT_MS,
      windowsHide: true,
    })
  } catch (err) {
    const raw = extractError(err)
    if (raw.toLowerCase().includes('nothing to commit')) {
      return { ok: false, error: 'Nothing to commit — the working tree is clean.' }
    }
    return { ok: false, error: raw }
  }

  if (push) {
    try {
      await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], {
        cwd: repoPath,
        timeout: GIT_NETWORK_TIMEOUT_MS,
        windowsHide: true,
      })
    } catch (err) {
      return { ok: false, error: extractError(err) }
    }
  }

  return { ok: true }
}

/**
 * Optionally commits dirty changes, pushes to origin, then creates a GitHub PR
 * via `gh pr create`. Returns { ok: true, url? } on success; gh's own error
 * messages (e.g. "not authenticated") are surfaced as { ok: false, error }.
 * Never throws.
 */
export async function openPr(
  repoPath: string,
  args: { commitMessage?: string; title: string; body?: string },
  ghPath: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const extractError = (err: unknown): string => {
    const asErr = err as { stderr?: string; stdout?: string }
    const text = asErr.stderr?.trim() || asErr.stdout?.trim()
    if (text && text.length > 0) return text
    return err instanceof Error ? err.message : String(err)
  }

  const isDirty = await getIsDirty(repoPath)
  if (isDirty === true && args.commitMessage?.trim()) {
    try {
      await execFileAsync('git', ['add', '-A'], {
        cwd: repoPath,
        timeout: GIT_COMMIT_TIMEOUT_MS,
        windowsHide: true,
      })
    } catch (err) {
      return { ok: false, error: extractError(err) }
    }
    try {
      await execFileAsync('git', ['commit', '-m', args.commitMessage], {
        cwd: repoPath,
        timeout: GIT_COMMIT_TIMEOUT_MS,
        windowsHide: true,
      })
    } catch (err) {
      return { ok: false, error: extractError(err) }
    }
  }

  try {
    await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], {
      cwd: repoPath,
      timeout: GIT_NETWORK_TIMEOUT_MS,
      windowsHide: true,
    })
  } catch (err) {
    return { ok: false, error: extractError(err) }
  }

  const branch = await getBranchInfo(repoPath)
  if (branch === null) {
    return { ok: false, error: 'Could not determine the current branch.' }
  }

  try {
    const { stdout } = await execFileAsync(
      ghPath,
      ['pr', 'create', `--title=${args.title}`, `--body=${args.body ?? ''}`, `--head=${branch}`],
      {
        cwd: repoPath,
        timeout: GIT_NETWORK_TIMEOUT_MS,
        windowsHide: true,
      },
    )
    const url = parsePrUrl(stdout) ?? undefined
    return { ok: true, url }
  } catch (err) {
    return { ok: false, error: extractError(err) }
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
