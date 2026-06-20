/**
 * Quotes process arguments per CommandLineToArgvW rules: any backslash run
 * preceding a quote (or the end of a quoted token) is doubled, then the
 * quote itself is escaped. Direct port of the C# ArgumentEscaper, which is
 * a port of the PowerShell launcher's ConvertTo-ArgumentString.
 *
 * Security note: this escapes for argv splitting (CreateProcess /
 * CommandLineToArgvW), NOT for shell interpretation. Shell metacharacters
 * (;, |, &, $, `, etc.) are not quoted by this function when they appear
 * without whitespace. Callers that construct shell command strings must
 * validate or reject those characters separately (see launchCommandBuilder).
 */

const BACKSLASHES_BEFORE_QUOTE = /(\\*)"/g
const TRAILING_BACKSLASHES = /(\\+)$/

function needsQuoting(arg: string): boolean {
  for (const ch of arg) {
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '"') return true
  }
  return false
}

/** Quotes a single argument per CommandLineToArgvW rules. */
export function quote(arg: string): string {
  if (arg.length === 0) return '""'
  if (!needsQuoting(arg)) return arg

  let escaped = arg.replace(BACKSLASHES_BEFORE_QUOTE, (_match, bsRun: string) => bsRun + bsRun + '\\"')
  const trailingMatch = TRAILING_BACKSLASHES.exec(escaped)
  if (trailingMatch) {
    escaped = escaped.slice(0, trailingMatch.index) + trailingMatch[1] + trailingMatch[1]
  }
  return '"' + escaped + '"'
}

/** Quotes each argument and joins with a single space. */
export function joinArgs(args: readonly string[]): string {
  return args.map(quote).join(' ')
}
