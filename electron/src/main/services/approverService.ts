/**
 * Terminal Auto-Approver lifecycle service.
 *
 * Owns the background PowerShell daemon (tools/terminal-auto-approver/Approver.ps1)
 * that watches every Windows Terminal tab and presses permission prompts. The
 * daemon reads/writes other tabs' consoles via the Win32 console API, so it must
 * run as a real, killable child process (not detached) — we manage start/stop.
 *
 * Because the packaged app ships the script under a read-only resources dir, the
 * service deploys a writable copy into the app-data folder and runs from there,
 * so the script's config.json and approver.log are writable and user-editable.
 *
 * Windows-only feature. On other platforms `available` is false and set() is a no-op.
 */
import { spawn, spawnSync, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { access } from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import type { ApproverStatus } from '../../shared/ipc'

const execFileAsync = promisify(execFile)

export interface ApproverServiceOptions {
  /** Directory containing the shipped Approver.ps1 + config.json (read-only when packaged). */
  sourceDir: string
  /** Writable directory to deploy and run the daemon from (e.g. %APPDATA%/ccmc/approver). */
  workDir: string
}

export interface IApproverService {
  /** Loads persisted desired state and starts the daemon if it was enabled. */
  init(): Promise<void>
  /** Current runtime status. */
  status(): ApproverStatus
  /** Enable/disable the daemon and persist the choice. `classify` toggles the security gate. */
  set(req: { enabled: boolean; classify?: boolean }): Promise<ApproverStatus>
  /** Stops the daemon (called on app quit). Does not change persisted state. */
  dispose(): void
}

interface Persisted {
  enabled: boolean
  classify: boolean
}

const PWSH_CANDIDATES = ['pwsh.exe', 'pwsh', 'powershell.exe', 'powershell']

export function createApproverService(opts: ApproverServiceOptions): IApproverService {
  const isWindows = process.platform === 'win32'
  const persistPath = path.join(opts.workDir, 'service.json')
  const deployedScript = path.join(opts.workDir, 'Approver.ps1')

  let child: ChildProcess | null = null
  let desired: Persisted = { enabled: false, classify: false }
  let pwshPath: string | null | undefined = undefined // undefined = not resolved yet
  let lastError: string | undefined

  // -- pwsh resolution (cached) ----------------------------------------------
  /**
   * Finds a PowerShell executable by walking PATH, not by launching anything.
   *
   * This used to spawnSync each candidate with a 5s timeout — up to four
   * blocking process launches on the main thread, freezing the UI, and
   * reachable from the approver:status IPC call. A plain existence check
   * answers the same question without blocking.
   */
  async function resolvePwsh(): Promise<string | null> {
    if (pwshPath !== undefined) return pwshPath
    pwshPath = null
    if (isWindows) {
      const dirs = (process.env['PATH'] ?? '')
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0)

      outer: for (const cand of PWSH_CANDIDATES) {
        for (const dir of dirs) {
          const full = path.join(dir, cand.endsWith('.exe') ? cand : `${cand}.exe`)
          try {
            await access(full)
            pwshPath = full
            break outer
          } catch {
            // not here — keep looking
          }
        }
      }
    }
    return pwshPath
  }

  function scriptAvailable(): boolean {
    return existsSync(path.join(opts.sourceDir, 'Approver.ps1'))
  }

  /**
   * Synchronous availability from cached facts only — never resolves pwsh, so
   * status() cannot block. Resolution happens in init()/set().
   */
  function isAvailable(): boolean {
    return isWindows && scriptAvailable() && pwshPath != null
  }

  /** True when a pid is still running. */
  function isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  /**
   * Kills daemons stranded by an earlier crash.
   *
   * Deliberately narrow. A daemon qualifies only if it runs OUR deployed script
   * AND its recorded -ParentPid is gone (or it predates -ParentPid entirely).
   * Sweeping every Approver.ps1 on the machine would be wrong: a second install
   * — or another test — would kill a daemon that still has a live owner.
   */
  async function reapOrphans(): Promise<void> {
    if (!isWindows) return
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*Approver.ps1*' } | " +
            'ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }',
        ],
        { windowsHide: true, timeout: 10000 },
      )

      const target = deployedScript.toLowerCase()

      for (const line of stdout.split(/\r?\n/)) {
        const sep = line.indexOf('|')
        if (sep <= 0) continue

        const pid = Number.parseInt(line.slice(0, sep).trim(), 10)
        const cmd = line.slice(sep + 1)
        if (!Number.isInteger(pid) || pid <= 0) continue
        if (pid === child?.pid || pid === process.pid) continue

        // Only daemons running the copy we deploy and manage.
        if (!cmd.toLowerCase().includes(target)) continue

        // Leave alone anything whose owning app is still running.
        const parent = /-ParentPid\s+(\d+)/.exec(cmd)
        if (parent && isPidAlive(Number.parseInt(parent[1], 10))) continue

        try {
          process.kill(pid)
          console.log('[approver] reaped orphaned daemon pid', pid)
        } catch {
          // already gone, or not ours to kill
        }
      }
    } catch (err) {
      console.error('[approver] orphan sweep failed:', (err as Error)?.message ?? err)
    }
  }

  // -- persistence -----------------------------------------------------------
  function loadPersisted(): void {
    try {
      const raw = JSON.parse(readFileSync(persistPath, 'utf8')) as Partial<Persisted>
      desired = {
        enabled: raw.enabled === true,
        classify: raw.classify === true,
      }
    } catch {
      desired = { enabled: false, classify: false }
    }
  }

  function savePersisted(): void {
    try {
      mkdirSync(opts.workDir, { recursive: true })
      writeFileSync(persistPath, JSON.stringify(desired, null, 2), 'utf8')
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  // -- deploy writable copy --------------------------------------------------
  function deploy(): void {
    mkdirSync(opts.workDir, { recursive: true })
    // Script is code → always refresh. config.json holds user edits → keep if present.
    copyFileSync(path.join(opts.sourceDir, 'Approver.ps1'), deployedScript)
    const srcCfg = path.join(opts.sourceDir, 'config.json')
    const dstCfg = path.join(opts.workDir, 'config.json')
    if (existsSync(srcCfg) && !existsSync(dstCfg)) {
      copyFileSync(srcCfg, dstCfg)
    }
  }

  // -- process control -------------------------------------------------------
  function start(): void {
    if (child) return
    if (!pwshPath) {
      lastError = 'PowerShell (pwsh/powershell) not found on PATH.'
      return
    }
    const pwsh = pwshPath
    deploy()
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', deployedScript]
    if (desired.classify) args.push('-Classify')
    // The daemon presses keys in the user's terminals, so it must not outlive
    // us. stop() covers a clean quit; -ParentPid covers a crash or force-kill.
    args.push('-ParentPid', String(process.pid))
    try {
      child = spawn(pwsh, args, {
        cwd: opts.workDir,
        stdio: 'ignore',
        windowsHide: true,
        detached: false,
      })
      lastError = undefined
      child.on('exit', () => {
        child = null
      })
      child.on('error', (err) => {
        lastError = err.message
        child = null
      })
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      child = null
    }
  }

  function stop(): void {
    if (!child || child.pid === undefined) {
      child = null
      return
    }
    const pid = child.pid
    try {
      if (isWindows) {
        // Kill the whole tree — the daemon may have transient child processes.
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      } else {
        child.kill('SIGTERM')
      }
    } catch {
      try {
        child.kill()
      } catch {
        // already gone
      }
    }
    child = null
  }

  // -- public API ------------------------------------------------------------
  function status(): ApproverStatus {
    return {
      enabled: desired.enabled,
      running: child !== null,
      available: isAvailable(),
      classify: desired.classify,
      error: lastError,
    }
  }

  return {
    async init(): Promise<void> {
      loadPersisted()
      // Clear daemons stranded by an earlier crash before starting our own.
      await reapOrphans()
      await resolvePwsh()
      if (desired.enabled && isAvailable()) {
        start()
      }
    },

    status,

    async set(req): Promise<ApproverStatus> {
      lastError = undefined
      if (typeof req.classify === 'boolean') desired.classify = req.classify
      desired.enabled = req.enabled === true
      savePersisted()

      await resolvePwsh()

      if (!isAvailable()) {
        if (!isWindows) lastError = 'Auto-approver is Windows-only.'
        else if (!scriptAvailable()) lastError = 'Approver script not found.'
        else lastError = 'PowerShell (pwsh/powershell) not found on PATH.'
        return status()
      }

      // Apply: restart cleanly so a classify-flag change takes effect.
      stop()
      if (desired.enabled) start()
      return status()
    },

    dispose(): void {
      stop()
    },
  }
}
