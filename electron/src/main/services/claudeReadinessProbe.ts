import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { isClaudeDirWritable } from '../../core/claude/claudeReadiness'

/**
 * Gathers filesystem facts and feeds them to the core `isClaudeDirWritable` decision fn.
 *
 * Probe logic mirrors C# ClaudeReadiness.IsClaudeDirWritable:
 *  1. If homeDir does not exist → false.
 *  2. If ~/.claude exists → probe inside it; otherwise probe inside homeDir.
 *  3. Write + delete a temp file in the probe dir; return true on success.
 *
 * @param homeDir The user's home directory (caller supplies; typically os.homedir()).
 */
export async function probeClaudeReadiness(homeDir: string): Promise<boolean> {
  let homeExists = false
  try {
    const stat = await fs.stat(homeDir)
    homeExists = stat.isDirectory()
  } catch {
    homeExists = false
  }

  if (!homeExists) {
    return isClaudeDirWritable({ homeExists: false, claudeDirExists: false, canWrite: false })
  }

  const claudeDir = path.join(homeDir, '.claude')
  let claudeDirExists = false
  try {
    const stat = await fs.stat(claudeDir)
    claudeDirExists = stat.isDirectory()
  } catch {
    claudeDirExists = false
  }

  const probeDir = claudeDirExists ? claudeDir : homeDir
  const probeFile = path.join(probeDir, '.ccmc-write-probe')

  let canWrite = false
  try {
    await fs.writeFile(probeFile, '')
    await fs.unlink(probeFile)
    canWrite = true
  } catch {
    canWrite = false
  }

  return isClaudeDirWritable({ homeExists, claudeDirExists, canWrite })
}
