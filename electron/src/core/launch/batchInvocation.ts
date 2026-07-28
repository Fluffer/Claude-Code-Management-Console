/**
 * Windows batch-file invocation shim.
 *
 * WHY THIS EXISTS
 * Since Node 20.12.2 (the CVE-2024-27980 fix) `child_process.spawn`/`execFile`
 * refuse to run a `.cmd`/`.bat` target with `shell: false` — the call throws
 * `Error: spawn EINVAL` synchronously. Windows cannot CreateProcess a batch
 * file directly either, so the only correct route is through cmd.exe.
 *
 * That breaks every CLI that ships as a batch shim, which on Windows is most of
 * them: VS Code (`code.cmd` — there is no `code.exe` on PATH), `npx.cmd` (the
 * command behind most `.mcp.json` stdio servers), and npm-global installs of
 * `claude` (`claude.cmd`).
 *
 * WHAT IT PRODUCES
 *   cmd.exe /d /v:off /s /c "<quoted command> <quoted args...>"
 *
 *   /d      skip the AutoRun registry command
 *   /v:off  delayed expansion off, so `!` in an argument stays literal
 *           regardless of the machine's default
 *   /s      take everything between the first and last quote verbatim
 *
 * The caller must pass `windowsVerbatimArguments: true` from the returned
 * invocation, otherwise Node re-quotes the already-quoted command line.
 *
 * QUOTING
 * Tokens are quoted per CommandLineToArgvW rules (the target program parses
 * them that way) and additionally force-quoted whenever they contain anything
 * outside a conservative safe set, so cmd.exe operators (`&`, `|`, `<`, `>`,
 * `^`, parentheses) are never seen by the cmd parser as operators.
 *
 * `%` IS REJECTED
 * cmd.exe expands `%VAR%` during parsing — inside double quotes too — and the
 * expansion result is re-parsed, so a `%` token can smuggle operators into the
 * command line. There is no escape that works on a `/c` command line (`%%` is a
 * batch-file-only reduction). A token containing `%` therefore throws, and the
 * caller surfaces the message instead of running something unintended.
 */

/** A process invocation ready to hand to spawn/execFile. */
export interface Invocation {
  file: string
  args: string[]
  /** True when `args` is a pre-quoted cmd.exe command line. */
  windowsVerbatimArguments: boolean
}

export interface BuildInvocationOptions {
  platform?: NodeJS.Platform
  /** Value of %ComSpec%. Defaults to 'cmd.exe' (always resolvable on Windows). */
  comSpec?: string | null
}

export const BATCH_PERCENT_MESSAGE =
  "Cannot run a .cmd/.bat command with a '%' in the path or arguments — " +
  'cmd.exe would expand it as an environment variable.'

const BATCH_EXT = /\.(cmd|bat)$/i

/** Characters that need no quoting and cannot be cmd.exe operators. */
const SAFE_TOKEN = /^[A-Za-z0-9_\-.:\\/]+$/

const BACKSLASHES_BEFORE_QUOTE = /(\\*)"/g
const TRAILING_BACKSLASHES = /(\\+)$/

/** True when `command` is a Windows batch file that must be run via cmd.exe. */
export function isBatchCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === 'win32' && BATCH_EXT.test(command)
}

/**
 * Quotes one token for a cmd.exe `/c` command line: CommandLineToArgvW escaping
 * for the target program, plus force-quoting so cmd sees no bare operators.
 */
function quoteCmdToken(token: string): string {
  if (token.length === 0) return '""'
  if (SAFE_TOKEN.test(token)) return token

  const escaped = token
    .replace(BACKSLASHES_BEFORE_QUOTE, (_m, bs: string) => bs + bs + '\\"')
    .replace(TRAILING_BACKSLASHES, (_m, bs: string) => bs + bs)

  return '"' + escaped + '"'
}

/**
 * Returns the invocation to actually spawn for `command args...`.
 *
 * Non-batch commands (and every non-Windows platform) pass straight through.
 * Batch commands are wrapped for cmd.exe as documented above.
 *
 * @throws Error (BATCH_PERCENT_MESSAGE) when a batch invocation contains '%'.
 */
export function buildInvocation(
  command: string,
  args: readonly string[],
  opts: BuildInvocationOptions = {},
): Invocation {
  const platform = opts.platform ?? process.platform

  if (!isBatchCommand(command, platform)) {
    return { file: command, args: [...args], windowsVerbatimArguments: false }
  }

  const tokens = [command, ...args]
  if (tokens.some((t) => t.includes('%'))) {
    throw new Error(BATCH_PERCENT_MESSAGE)
  }

  const commandLine = '"' + tokens.map(quoteCmdToken).join(' ') + '"'

  return {
    file: opts.comSpec || 'cmd.exe',
    args: ['/d', '/v:off', '/s', '/c', commandLine],
    windowsVerbatimArguments: true,
  }
}
