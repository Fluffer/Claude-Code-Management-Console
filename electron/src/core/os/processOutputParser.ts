import type { RunningSession } from '../models'

/** A raw process entry from OS enumeration (tasklist / wmic). */
export interface ProcEntry {
  pid: number
  ppid: number
  name: string
  commandLine: string
  workingDirectory: string
}

/**
 * Parses `tasklist /v /fo csv` stdout into ProcEntry[].
 * The /v format has columns:
 *   "Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"
 * Note: /v does NOT include command line — use parseWmicProcessOutput for that.
 * This parser is used for the integration check (finding by pid/name).
 * Pure function — no I/O. Handles both \r\n and \n.
 */
export function parseTasklistCsv(stdout: string): ProcEntry[] {
  const lines = stdout.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 2) return []

  const result: ProcEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvRow(lines[i])
    if (fields.length < 2) continue
    const name = stripQuotes(fields[0])
    const pid = parseInt(stripQuotes(fields[1]), 10)
    if (isNaN(pid)) continue
    result.push({ pid, ppid: 0, name, commandLine: '', workingDirectory: '' })
  }
  return result
}

/**
 * Parses `wmic process get Caption,CommandLine,ParentProcessId,ProcessId,WorkingSetSize /format:csv`
 * or `Get-CimInstance Win32_Process | Select-Object Caption,CommandLine,ParentProcessId,ProcessId | ConvertTo-Csv`
 * stdout into ProcEntry[].
 * Pure function — no I/O.
 */
export function parseWmicProcessOutput(stdout: string): ProcEntry[] {
  const lines = stdout.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 2) return []

  const header = splitCsvRow(lines[0]).map(h => stripQuotes(h).toLowerCase())
  const captionIdx = header.indexOf('caption')
  const cmdIdx = header.indexOf('commandline')
  const ppidIdx = header.indexOf('parentprocessid')
  const pidIdx = header.indexOf('processid')

  if (pidIdx === -1 || captionIdx === -1) return []

  const result: ProcEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvRow(lines[i])
    const pidStr = pidIdx < fields.length ? stripQuotes(fields[pidIdx]) : ''
    const pid = parseInt(pidStr, 10)
    if (isNaN(pid)) continue

    const ppidStr = ppidIdx >= 0 && ppidIdx < fields.length ? stripQuotes(fields[ppidIdx]) : '0'
    const ppid = parseInt(ppidStr, 10) || 0
    const name = captionIdx < fields.length ? stripQuotes(fields[captionIdx]) : ''
    const commandLine = cmdIdx >= 0 && cmdIdx < fields.length ? stripQuotes(fields[cmdIdx]) : ''

    result.push({ pid, ppid, name, commandLine, workingDirectory: '' })
  }
  return result
}

/**
 * Filters a ProcEntry[] to only those that look like Claude CLI sessions,
 * mirroring RunningClaudeDetector.cs logic.
 * - claude / claude.exe: always included
 * - node / node.exe / bun / bun.exe: included only when commandLine contains "claude"
 * Returns RunningSession[] (workingDirectory trimmed of trailing separators).
 */
export function filterClaudeSessions(entries: ProcEntry[]): RunningSession[] {
  const CANDIDATE_NAMES = new Set(['claude', 'claude.exe', 'node', 'node.exe', 'bun', 'bun.exe'])
  const CLAUDE_HOSTS = new Set(['node', 'node.exe', 'bun', 'bun.exe'])

  const result: RunningSession[] = []
  for (const e of entries) {
    const nameLower = e.name.toLowerCase()
    if (!CANDIDATE_NAMES.has(nameLower)) continue

    if (CLAUDE_HOSTS.has(nameLower)) {
      if (!e.commandLine.toLowerCase().includes('claude')) continue
    }

    const cwd = e.workingDirectory.replace(/[/\\]+$/, '')
    result.push({ pid: e.pid, processName: e.name, workingDirectory: cwd })
  }
  return result
}

/** Splits a single CSV row, respecting double-quoted fields with embedded commas. */
function splitCsvRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/""/g, '"')
  }
  return t
}
