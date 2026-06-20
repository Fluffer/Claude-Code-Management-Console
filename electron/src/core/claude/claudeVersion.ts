/**
 * Pure utility for extracting a semver-like version string from `claude --version` output.
 * No side effects; safe to unit-test without mocks.
 */

const VERSION_RE = /\d+\.\d+\.\d+(?:-[\w.]+)?/

/**
 * Extracts the first semver-like version from the stdout of `claude --version`.
 * Handles forms such as:
 *   "1.2.3"
 *   "claude 1.2.3"
 *   "1.2.3 (Claude Code)"
 *   "@anthropic-ai/claude-code/1.2.3"
 *   "1.2.3-beta.1"
 * Returns null for empty or unrecognised output.
 */
export function parseClaudeVersion(stdout: string): string | null {
  if (!stdout || !stdout.trim()) return null
  const m = VERSION_RE.exec(stdout)
  return m ? m[0] : null
}
