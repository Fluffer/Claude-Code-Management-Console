import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { TranscriptMessage } from '../../core/models'
import { encodeProjectPath } from '../../core/claude/sessionLister'
import { parseTranscript } from '../../core/claude/transcriptParser'
import { computeCost, type CostResult } from '../../core/cost/costCalculator'
import { readFileUtf8 } from '../os/atomicFile'

function projectDir(claudeBaseDir: string, projectPath: string): string {
  return path.join(claudeBaseDir, 'projects', encodeProjectPath(projectPath))
}

/**
 * Reads and parses a single session transcript.
 * `sessionId` must be a bare file stem (no path separators) — the IPC handler
 * validates this before calling. Returns [] when the file is absent.
 */
export async function readTranscript(
  claudeBaseDir: string,
  projectPath: string,
  sessionId: string,
): Promise<TranscriptMessage[]> {
  const file = path.join(projectDir(claudeBaseDir, projectPath), `${sessionId}.jsonl`)
  const content = await readFileUtf8(file)
  return parseTranscript(content)
}

export interface ProjectCost extends CostResult {
  /** Number of session transcripts summed. */
  sessionCount: number
}

/**
 * Sums the cost of every session transcript for a project. Reads each *.jsonl
 * under the project's transcript dir. Returns zeros when the dir is absent.
 */
export async function projectCost(claudeBaseDir: string, projectPath: string): Promise<ProjectCost> {
  const dir = projectDir(claudeBaseDir, projectPath)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return { usd: 0, hasUnknownModel: false, sessionCount: 0 }
  }
  const files = entries.filter((f) => f.endsWith('.jsonl'))
  let usd = 0
  let hasUnknownModel = false
  for (const f of files) {
    const content = await readFileUtf8(path.join(dir, f))
    const cost = computeCost(parseTranscript(content))
    usd += cost.usd
    if (cost.hasUnknownModel) hasUnknownModel = true
  }
  return { usd, hasUnknownModel, sessionCount: files.length }
}
