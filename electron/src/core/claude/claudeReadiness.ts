/**
 * Pure "can Claude start cleanly here?" decision logic.
 *
 * The actual filesystem probe (writing a temp file to verify write access) is a
 * Phase 3 concern handled by the main-process wrapper.
 *
 * TODO Phase 3: wrap isClaudeDirWritable with a real fs probe:
 *   - resolve homeDir via os.homedir()
 *   - pick probeDir = .claude subdir if it exists, else homeDir
 *   - write+delete a temp file; return true on success, false on IOException/EPERM
 */

/** Inputs derived from the filesystem by the Phase 3 caller. */
export interface ClaudeReadinessFacts {
  /** Whether the home directory itself exists. */
  homeExists: boolean
  /** Whether $HOME/.claude exists (if false, probe goes to homeDir). */
  claudeDirExists: boolean
  /** Whether a write+delete probe succeeded in the probe directory. */
  canWrite: boolean
}

/**
 * Pure decision: the user's .claude dir (or home dir) is writable.
 * Returns false immediately when home is missing.
 */
export function isClaudeDirWritable(facts: ClaudeReadinessFacts): boolean {
  if (!facts.homeExists) return false
  return facts.canWrite
}
