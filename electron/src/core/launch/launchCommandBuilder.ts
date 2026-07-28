/**
 * Builds process invocation specs for claude session launch.
 *
 * Windows strategy (current):
 *   wt.exe -w 0 new-tab --title <name> -d <path> <shell> -NoExit -Command "claude ..."
 * Shell-only fallback (when Windows Terminal is unavailable):
 *   <shell> -NoExit -Command "claude ..."  (workingDirectory set on the process)
 *
 * macOS strategy: TODO Phase 3 — pass platform:'darwin' to buildLaunchSpec
 * and implement an open-terminal strategy. The composable exports below
 * (buildClaudeCommand, buildWtArgs, buildShellArgs) are designed to be
 * consumed by a platform-specific strategy without rewriting this module.
 *
 * SECURITY: The claude command line is handed to PowerShell via -Command, so
 * shell operators / expansions would be interpreted rather than reaching claude.
 * areFlagsSafe() blocks those characters, turning a quiet injection vector
 * into a clear validation error. The -n name and initialPrompt arguments are
 * single-quoted (every ' doubled) rather than passed through AreFlagsSafe —
 * single quoting makes arbitrary text safe in PowerShell -Command strings.
 */

import type { LaunchSpec } from '../models'
import { joinArgs } from './argumentEscaper'
import { getTerminal } from './terminals'

// Characters that would be interpreted as shell operators / expansions by
// PowerShell -Command if they appeared in a flags string.
const UNSAFE_FLAG_CHARS = [';', '|', '&', '$', '`', '(', ')', '{', '}', '<', '>', '\n', '\r', '#']

export const UNSAFE_FLAG_MESSAGE =
  'Flags may not contain shell characters (; | & $ ` ( ) { } < > #) or line breaks.'

/** Returns true when the flag string contains no shell-unsafe characters. */
export function areFlagsSafe(flags: string): boolean {
  for (const ch of UNSAFE_FLAG_CHARS) {
    if (flags.includes(ch)) return false
  }
  return true
}

export interface BuildClaudeCommandOptions {
  flags: string
  continueSession: boolean
  /** Optional initial prompt. Ignored when continueSession is true. */
  initialPrompt?: string | null
  /** Session display name, passed as -n. Single-quoted for PowerShell safety. */
  name?: string | null
}

/**
 * Builds the `claude [flags]` command string that will be passed to PowerShell
 * via -Command. Pure — no process/fs access.
 *
 * Argument quoting strategy (for PowerShell -Command):
 *   - name and initialPrompt: single-quoted, every ' doubled (PS single-quote escaping)
 *   - flags: appended verbatim after AreFlagsSafe validation (caller's responsibility)
 */
export function buildClaudeCommand(opts: BuildClaudeCommandOptions): string {
  const { flags, continueSession, initialPrompt, name } = opts

  if (flags === null || flags === undefined) {
    throw new TypeError('flags must not be null or undefined')
  }
  if (!areFlagsSafe(flags)) {
    throw new Error(UNSAFE_FLAG_MESSAGE)
  }

  let command = 'claude'

  // -n sets the claude session display name AND the terminal title (claude holds
  // it for the life of the session; WT --title alone is overwritten at launch).
  // Single-quoted for PowerShell -Command; every ' doubled. Not run through
  // areFlagsSafe — single quoting makes an arbitrary folder name safe.
  if (name != null && name.trim().length > 0) {
    command += " -n '" + name.replace(/'/g, "''") + "'"
  }

  if (continueSession) {
    command += ' --continue'
  } else if (initialPrompt != null && initialPrompt.trim().length > 0) {
    command += " '" + initialPrompt.replace(/'/g, "''") + "'"
  }

  const trimmedFlags = flags.trim()
  if (trimmedFlags.length > 0) {
    command += ' ' + trimmedFlags
  }

  return command
}

export interface BuildLaunchSpecOptions {
  projectName: string
  projectPath: string
  flags: string
  continueSession: boolean
  /** Shell executable (e.g. 'pwsh', 'powershell'). Required — caller resolves it. */
  shell: string
  /**
   * Absolute path to wt.exe, or null to use shell-only fallback.
   * On win32: pass the resolved path (or null when WT is not found).
   * Phase 3: on darwin, this should be null (macOS uses a different strategy).
   */
  wtPath: string | null
  initialPrompt?: string | null
  /**
   * Explicitly selected terminal (id + resolved exe path). When present and the
   * id resolves to a registry strategy, that strategy builds the spec. When
   * absent or unknown, falls back to the wtPath/shell default below.
   */
  terminal?: { id: string; path: string } | null
}

/**
 * Escapes a value for Windows Terminal's own command-line parser.
 *
 * wt splits its arguments on ';' to chain sub-commands, and does so after
 * CommandLineToArgvW has removed the quotes — so quoting alone does not protect
 * it. A semicolon is legal in a Windows folder name, which means a project
 * called 'a;b' would otherwise break the launch or inject a second wt command.
 * wt's documented escape is a backslash before the semicolon.
 */
export function escapeWtValue(value: string): string {
  return value.replace(/;/g, '\\;')
}

/**
 * Builds the argv arrays for Windows Terminal (wt) launch.
 * Exported for composability and testing without going through buildLaunchSpec.
 */
export function buildWtArgs(
  projectName: string,
  projectPath: string,
  shell: string,
  claudeCommand: string
): string[] {
  return [
    '-w', '0', 'new-tab', '--title', escapeWtValue(projectName),
    '-d', escapeWtValue(projectPath),
    shell, '-NoExit', '-Command', escapeWtValue(claudeCommand),
  ]
}

/**
 * Builds the argv array for the shell-only (no WT) fallback.
 * Exported for composability.
 */
export function buildShellArgs(claudeCommand: string): string[] {
  return ['-NoExit', '-Command', claudeCommand]
}

/**
 * Builds a complete LaunchSpec for the given project and flags.
 *
 * Platform extensibility: for Phase 3 macOS support, add a
 * `platform?: 'win32' | 'darwin'` parameter and dispatch to a
 * `buildDarwinLaunchSpec()` helper that uses `open -a Terminal` or
 * `osascript`. The win32 path (current) stays unchanged.
 *
 * NOTE: This function is pure — it does NOT call process.platform,
 * CommandLocator, or any I/O. Callers (main process) resolve shell
 * and wtPath before calling here.
 */
export function buildLaunchSpec(opts: BuildLaunchSpecOptions): LaunchSpec {
  const { projectName, projectPath, flags, continueSession, shell, wtPath, initialPrompt, terminal } = opts

  const claudeCommand = buildClaudeCommand({ flags, continueSession, initialPrompt, name: projectName })

  // Explicit terminal selection wins when its id resolves to a registry strategy.
  if (terminal != null && terminal.path.trim().length > 0) {
    const strategy = getTerminal(terminal.id)
    if (strategy != null) {
      return strategy.buildSpec({
        terminalPath: terminal.path,
        shell,
        projectName,
        projectPath,
        claudeCommand,
      })
    }
    // Unknown id → fall through to the wtPath/shell default below.
  }

  if (wtPath != null && wtPath.trim().length > 0) {
    const wtArgs = buildWtArgs(projectName, projectPath, shell, claudeCommand)
    return { filePath: wtPath, arguments: joinArgs(wtArgs), workingDirectory: null }
  }

  const shellArgs = buildShellArgs(claudeCommand)
  return { filePath: shell, arguments: joinArgs(shellArgs), workingDirectory: projectPath }
}
