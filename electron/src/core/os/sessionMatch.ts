import type { RunningSession } from '../models'

/**
 * Decides whether a running session belongs to a project row.
 *
 * Matching is by working directory when available, falling back to the session
 * name (parsed from the launcher's `-n <project name>`). On Windows the working
 * directory is unavailable (CIM/Win32_Process does not expose it), so the name
 * is in practice the operative key for console-launched sessions. A session
 * launched without a name (e.g. a bare `claude` typed by hand) cannot be
 * attributed to a row and matches nothing.
 */
export function sessionMatchesProject(
  session: RunningSession,
  project: { path: string; name: string },
): boolean {
  const wd = session.workingDirectory?.toLowerCase() ?? ''
  if (wd && wd === project.path.toLowerCase()) return true

  const sn = session.sessionName?.toLowerCase() ?? ''
  if (sn && sn === project.name.toLowerCase()) return true

  return false
}
