/**
 * Pure helper for extracting a GitHub pull-request URL from `gh pr create`
 * stdout.
 *
 * No fs/process access — safe to import from the renderer if needed.
 */

// Matches the first https://github.com/<owner>/<repo>/pull/<number> URL.
const PR_URL_RE = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/

/**
 * Extract the first GitHub PR URL from `gh pr create` stdout.
 *
 * `gh` prints the URL on its own line, sometimes amid diagnostic output.
 * Returns the matched URL string (trimmed), or `null` if none is found.
 */
export function parsePrUrl(stdout: string): string | null {
  const match = PR_URL_RE.exec(stdout)
  return match ? match[0].trim() : null
}
