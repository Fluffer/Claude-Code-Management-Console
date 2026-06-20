/**
 * Pure JSONL/session parsing logic for Claude transcript files.
 *
 * Phase 3 wrapper (main process) is responsible for:
 *   - enumerating *.jsonl files under ~/.claude/projects/<encoded>/
 *   - reading each file's first line and last-write mtime
 *   - calling parseSessionEntries() with the collected facts
 *
 * TODO Phase 3: implement ListSessions / NewestSessionUtc as fs wrappers
 * that call encodeProjectPath + Directory.EnumerateFiles then delegate here.
 */

import type { SessionSummary } from '../models'

const MAX_PREVIEW_LENGTH = 120

/** Encodes a project path into the directory name Claude Code uses. */
export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[^A-Za-z0-9]/g, '-')
}

/** Raw facts read from a single .jsonl file by the Phase 3 caller. */
export interface RawSessionEntry {
  /** File stem (UUID without .jsonl). */
  sessionId: string
  /** ISO-8601 UTC mtime of the file. */
  lastWriteUtc: string
  /** First non-empty line of the file (may be empty string if unreadable). */
  firstLine: string
}

/**
 * Extracts a displayable user-message preview from a single JSONL line.
 * Mirrors C# ClaudeSessionLister.ExtractText — case-sensitive property names.
 */
export function extractText(line: string): string | null {
  try {
    const root = JSON.parse(line)
    if (typeof root !== 'object' || root === null) return null
    const msg = 'message' in root && typeof root.message === 'object' && root.message !== null
      ? root.message
      : root
    if (!('content' in msg)) return null
    const content = msg.content
    if (typeof content === 'string') return content || null
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
          return part.text || null
        }
      }
    }
  } catch {
    // JSON parse error → return null
  }
  return null
}

/** Truncates with an ellipsis, matching C# Truncate(s, 120). */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '…'
}

/**
 * Reads the first user-message preview from a raw first-line string.
 * Returns "" on any parse/extraction failure, mirroring C# ReadFirstUserMessage.
 */
export function readFirstUserMessage(firstLine: string): string {
  if (!firstLine.trim()) return ''
  const text = extractText(firstLine)
  if (text === null) return ''
  return truncate(text, MAX_PREVIEW_LENGTH)
}

/**
 * Converts raw session entries into SessionSummary[], sorted newest-first.
 * This is the pure counterpart of C# ClaudeSessionLister.ListSessions.
 */
export function parseSessionEntries(entries: RawSessionEntry[]): SessionSummary[] {
  const summaries: SessionSummary[] = entries.map((e) => ({
    sessionId: e.sessionId,
    lastWriteUtc: e.lastWriteUtc,
    firstUserMessage: readFirstUserMessage(e.firstLine),
  }))
  return summaries.sort(
    (a, b) => new Date(b.lastWriteUtc).getTime() - new Date(a.lastWriteUtc).getTime(),
  )
}
