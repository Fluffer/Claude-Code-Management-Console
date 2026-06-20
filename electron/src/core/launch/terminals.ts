/**
 * Terminal strategy registry (pure — no process/fs/electron).
 *
 * Each strategy turns a resolved terminal executable + the claude command into a
 * LaunchSpec. The executable PATH is resolved impurely in main and passed in via
 * `terminalPath`, keeping this layer pure.
 *
 * Windows: `wt` and `wtai` share the Windows-Terminal arg shape. `wtai` is a
 * separate entry so it can diverge if `wtai.exe`'s CLI differs.
 *
 * macOS: registered as stubs so the registry/UI are platform-complete; they are
 * never invoked on Windows (detection is OS-filtered). When implemented, the
 * command must be POSIX-quoted — `cd '<path>' && claude …` with every `'`
 * escaped as `'\''` (close-quote, escaped quote, reopen-quote).
 */
import type { LaunchSpec } from '../models'
import { joinArgs } from './argumentEscaper'

export type TerminalPlatform = 'win32' | 'darwin'

export interface TerminalBuildArgs {
  /** Absolute path to the terminal executable/app (resolved in main). */
  terminalPath: string
  /** Resolved shell (e.g. 'pwsh'). */
  shell: string
  projectName: string
  projectPath: string
  /** The `claude …` command string, already quoted by buildClaudeCommand. */
  claudeCommand: string
}

export interface TerminalStrategy {
  id: string
  name: string
  platform: TerminalPlatform
  buildSpec(args: TerminalBuildArgs): LaunchSpec
}

/**
 * Windows-Terminal-family launch spec. Mirrors buildWtArgs in
 * launchCommandBuilder (kept inline to avoid a circular import).
 */
function wtSpec({
  terminalPath,
  shell,
  projectName,
  projectPath,
  claudeCommand,
}: TerminalBuildArgs): LaunchSpec {
  const args = [
    '-w', '0', 'new-tab', '--title', projectName,
    '-d', projectPath,
    shell, '-NoExit', '-Command', claudeCommand,
  ]
  return { filePath: terminalPath, arguments: joinArgs(args), workingDirectory: null }
}

/** A not-yet-implemented macOS strategy that fails loudly if ever invoked. */
function macStub(name: string): (a: TerminalBuildArgs) => LaunchSpec {
  return () => {
    throw new Error(`Terminal '${name}' is not yet implemented on macOS`)
  }
}

export const TERMINALS: readonly TerminalStrategy[] = [
  { id: 'wt',   name: 'Windows Terminal',    platform: 'win32', buildSpec: wtSpec },
  { id: 'wtai', name: 'Windows Terminal AI', platform: 'win32', buildSpec: wtSpec },
  { id: 'terminal-app', name: 'Terminal', platform: 'darwin', buildSpec: macStub('Terminal') },
  { id: 'iterm2',       name: 'iTerm2',   platform: 'darwin', buildSpec: macStub('iTerm2') },
  { id: 'warp',         name: 'Warp',     platform: 'darwin', buildSpec: macStub('Warp') },
  { id: 'ghostty',      name: 'Ghostty',  platform: 'darwin', buildSpec: macStub('Ghostty') },
]

/** The executable to resolve on Windows for a given terminal id. */
export const WINDOWS_TERMINAL_EXE: Readonly<Record<string, string>> = {
  wt: 'wt.exe',
  wtai: 'wtai.exe',
}

export function getTerminal(id: string): TerminalStrategy | null {
  return TERMINALS.find((t) => t.id === id) ?? null
}

export function terminalsForPlatform(platform: TerminalPlatform): TerminalStrategy[] {
  return TERMINALS.filter((t) => t.platform === platform)
}
