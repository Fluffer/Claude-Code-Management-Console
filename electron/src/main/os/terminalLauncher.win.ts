import { spawn } from 'node:child_process'
import type { ITerminalLauncher, LaunchResult } from './terminalLauncher'
import type { LaunchSpec } from '../../core/models'

/**
 * Launches a terminal session from a LaunchSpec.
 * The spec is built by core buildLaunchSpec (which uses joinArgs/quote for argv safety).
 * We parse the pre-joined arguments string back into an array for spawn.
 * spawn is called with shell:false and detached:true — the child survives the app.
 * Ported from SessionLauncher.cs / ClaudeCliService.cs.
 */
export class WindowsTerminalLauncher implements ITerminalLauncher {
  async launch(spec: LaunchSpec): Promise<LaunchResult> {
    try {
      const args = parseArgString(spec.arguments)
      const child = spawn(spec.filePath, args, {
        shell: false,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        ...(spec.workingDirectory ? { cwd: spec.workingDirectory } : {}),
      })

      child.unref()

      return new Promise<LaunchResult>((resolve) => {
        // Give it a short window to fail at spawn time (e.g., file not found)
        child.once('error', (err) => {
          resolve({ ok: false, error: err.message })
        })
        // If we get a pid it started successfully
        if (child.pid !== undefined) {
          resolve({ ok: true, pid: child.pid })
        }
      })
    } catch (err) {
      const e = err as Error
      return { ok: false, error: e.message }
    }
  }
}

/**
 * Parses a CommandLineToArgvW-style argument string (as produced by joinArgs/quote)
 * back into an array of individual arguments. This is the inverse of argumentEscaper.joinArgs.
 *
 * Rules per CommandLineToArgvW:
 * - Tokens are separated by whitespace (space/tab) outside quotes
 * - " toggles quoting; "" inside quotes emits a literal "
 * - Backslashes before " are special: N backslashes + " → ⌊N/2⌋ backslashes + (N%2==1 ? literal-" : close-quote)
 * - Backslashes not before " pass through literally
 */
export function parseArgString(args: string): string[] {
  const result: string[] = []
  let i = 0
  const n = args.length

  while (i < n) {
    // Skip whitespace between tokens
    while (i < n && (args[i] === ' ' || args[i] === '\t')) i++
    if (i >= n) break

    let token = ''
    let inQuote = false

    while (i < n) {
      const ch = args[i]

      if (ch === '"') {
        if (inQuote && args[i + 1] === '"') {
          // "" inside quotes = literal "
          token += '"'
          i += 2
        } else {
          inQuote = !inQuote
          i++
        }
      } else if (ch === '\\') {
        // Count consecutive backslashes
        let bsCount = 0
        while (i < n && args[i] === '\\') { bsCount++; i++ }
        if (i < n && args[i] === '"') {
          // N backslashes before " → floor(N/2) backslashes + (N odd → literal ")
          token += '\\'.repeat(Math.floor(bsCount / 2))
          if (bsCount % 2 === 1) {
            token += '"'
            i++ // consume the "
          }
          // if even, the " is a quote toggle (handled next iteration)
        } else {
          // Not followed by " — all backslashes are literal
          token += '\\'.repeat(bsCount)
        }
      } else if (!inQuote && (ch === ' ' || ch === '\t')) {
        break
      } else {
        token += ch
        i++
      }
    }

    result.push(token)
  }

  return result
}
