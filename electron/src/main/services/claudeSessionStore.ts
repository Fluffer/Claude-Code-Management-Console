import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import type { SessionSummary } from '../../core/models'
import {
  encodeProjectPath,
  parseSessionEntries,
  type RawSessionEntry,
} from '../../core/claude/sessionLister'

/**
 * Lists all resumable sessions for a project.
 *
 * Enumerates `<claudeBaseDir>/projects/<encoded>/*.jsonl`, reads each file's
 * first line and mtime, then delegates to core `parseSessionEntries`.
 *
 * Mirrors C# ClaudeSessionLister.ListSessions.
 *
 * @param projectPath Absolute path to the project folder.
 * @param claudeBaseDir Base directory of the .claude folder (e.g. `~/.claude`).
 */
export async function listSessions(
  projectPath: string,
  claudeBaseDir: string,
): Promise<SessionSummary[]> {
  const encoded = encodeProjectPath(projectPath)
  const dir = path.join(claudeBaseDir, 'projects', encoded)

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const rawEntries: RawSessionEntry[] = []

  for (const entry of entries) {
    if (!entry.name.endsWith('.jsonl')) continue
    const filePath = path.join(dir, entry.name)

    let mtimeUtc: string
    try {
      const stat = await fs.stat(filePath)
      mtimeUtc = stat.mtime.toISOString()
    } catch {
      continue
    }

    let firstLine = ''
    try {
      const handle = await fs.open(filePath, 'r')
      try {
        // Read enough bytes for first line (JSONL lines can be large but 64KB is generous)
        const buf = Buffer.alloc(65536)
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
        const text = buf.toString('utf8', 0, bytesRead)
        const lineEnd = text.indexOf('\n')
        firstLine = lineEnd >= 0 ? text.slice(0, lineEnd) : text
      } finally {
        await handle.close()
      }
    } catch {
      firstLine = ''
    }

    const sessionId = path.basename(entry.name, '.jsonl')
    rawEntries.push({ sessionId, lastWriteUtc: mtimeUtc, firstLine })
  }

  return parseSessionEntries(rawEntries)
}

/**
 * Returns the mtime of the newest session transcript for a project, or null
 * if there are no sessions. Stats only — never reads file content.
 *
 * Mirrors C# ClaudeSessionLister.NewestSessionUtc.
 *
 * @param projectPath Absolute path to the project folder.
 * @param claudeBaseDir Base directory of the .claude folder (e.g. `~/.claude`).
 */
export async function newestSessionUtc(
  projectPath: string,
  claudeBaseDir: string,
): Promise<string | null> {
  const encoded = encodeProjectPath(projectPath)
  const dir = path.join(claudeBaseDir, 'projects', encoded)

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }

  let newest: Date | null = null
  for (const entry of entries) {
    if (!entry.name.endsWith('.jsonl')) continue
    try {
      const stat = await fs.stat(path.join(dir, entry.name))
      if (!newest || stat.mtime > newest) {
        newest = stat.mtime
      }
    } catch {
      // skip unreadable
    }
  }

  return newest ? newest.toISOString() : null
}
