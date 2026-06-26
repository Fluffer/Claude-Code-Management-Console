import type { RunningSession } from '../models'

/** Lower-cases and strips trailing path separators, matching C# TrimCwd. */
function normalizePath(p: string): string {
  return p.replace(/[/\\]+$/, '').toLowerCase()
}

/**
 * Decides whether a running session belongs to a project row.
 *
 * Primary signal is the working directory: a session counts as the project's
 * when its cwd is the project folder OR anywhere beneath it (mirrors the C#
 * RunningClaudeDetector prefix match). When the cwd could not be read (access
 * denied, process exited mid-scan), fall back to the session name parsed from
 * the launcher's `-n <project name>`. A session with neither — e.g. a bare
 * `claude` launched outside any known root — matches nothing.
 */
export function sessionMatchesProject(
  session: RunningSession,
  project: { path: string; name: string },
): boolean {
  const wd = normalizePath(session.workingDirectory ?? '')
  if (wd) {
    const p = normalizePath(project.path)
    if (wd === p || wd.startsWith(p + '\\') || wd.startsWith(p + '/')) return true
  }

  const sn = session.sessionName?.toLowerCase() ?? ''
  if (sn && sn === project.name.toLowerCase()) return true

  return false
}
