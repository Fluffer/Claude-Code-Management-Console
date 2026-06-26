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
  const wdIdx = header.indexOf('workingdirectory')

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
    const workingDirectory = wdIdx >= 0 && wdIdx < fields.length ? stripQuotes(fields[wdIdx]) : ''

    result.push({ pid, ppid, name, commandLine, workingDirectory })
  }
  return result
}

/**
 * Identifies processes that share an image name with the Claude CLI but are NOT
 * interactive Claude Code sessions, so they must not be counted as "live":
 *   - The Claude Desktop app (Microsoft Store package) and its Electron/Chromium
 *     child processes — all named claude.exe. Children carry `--type=...`; the
 *     package lives under `\WindowsApps\`.
 *   - Headless / SDK / embedded-agent invocations (e.g. the desktop app's bundled
 *     Claude Code, or a management-console driver) — these use stream-json I/O or
 *     a permission-prompt tool and never represent a user terminal session.
 */
function isNonSessionProcess(commandLineLower: string): boolean {
  if (commandLineLower.includes('--type=')) return true
  if (commandLineLower.includes('\\windowsapps\\')) return true
  if (
    commandLineLower.includes('--output-format') ||
    commandLineLower.includes('--input-format') ||
    commandLineLower.includes('stream-json') ||
    commandLineLower.includes('--permission-prompt-tool')
  ) {
    return true
  }
  return false
}

/**
 * Extracts the session display name passed via `-n <name>` / `--name <name>`.
 * The launcher sets this to the project name; the OS may re-quote it with
 * single or double quotes, so both styles (and a bare token) are handled.
 * Returns null when no name flag is present.
 */
export function extractSessionName(commandLine: string): string | null {
  const m = commandLine.match(/(?:^|\s)(?:-n|--name)\s+(?:"([^"]*)"|'([^']*)'|(\S+))/)
  if (!m) return null
  const name = (m[1] ?? m[2] ?? m[3] ?? '').trim()
  return name.length > 0 ? name : null
}

/**
 * Filters a ProcEntry[] to only those that are interactive Claude Code CLI
 * sessions.
 * - claude / claude.exe: included unless they are the desktop app, an Electron
 *   child, or a headless/SDK invocation (see isNonSessionProcess).
 * - node / node.exe / bun / bun.exe: included only when commandLine runs the
 *   Claude Code CLI (contains "claude-code"). A bare "claude" substring is too
 *   loose — it matches unrelated tools whose path merely contains the word
 *   "claude" (e.g. this app's own "Claude Code Management Console" node procs).
 * Each result carries the trimmed workingDirectory and the parsed sessionName
 * (from -n / --name) used to map the session back to a project.
 */
export function filterClaudeSessions(entries: ProcEntry[]): RunningSession[] {
  const CANDIDATE_NAMES = new Set(['claude', 'claude.exe', 'node', 'node.exe', 'bun', 'bun.exe'])
  const CLAUDE_HOSTS = new Set(['node', 'node.exe', 'bun', 'bun.exe'])

  const result: RunningSession[] = []
  for (const e of entries) {
    const nameLower = e.name.toLowerCase()
    if (!CANDIDATE_NAMES.has(nameLower)) continue

    const cmdLower = e.commandLine.toLowerCase()

    if (CLAUDE_HOSTS.has(nameLower)) {
      if (!cmdLower.includes('claude-code')) continue
    }

    if (isNonSessionProcess(cmdLower)) continue

    const cwd = e.workingDirectory.replace(/[/\\]+$/, '')
    const sessionName = extractSessionName(e.commandLine)
    result.push({
      pid: e.pid,
      processName: e.name,
      workingDirectory: cwd,
      ...(sessionName ? { sessionName } : {}),
    })
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
