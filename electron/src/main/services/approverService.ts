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
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import type { ApproverStatus } from '../../shared/ipc'

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
  function resolvePwsh(): string | null {
    if (pwshPath !== undefined) return pwshPath
    pwshPath = null
    if (isWindows) {
      for (const cand of PWSH_CANDIDATES) {
        try {
          const r = spawnSync(cand, ['-NoLogo', '-NoProfile', '-Command', 'exit 0'], {
            timeout: 5000,
            windowsHide: true,
          })
          if (!r.error && r.status === 0) {
            pwshPath = cand
            break
          }
        } catch {
          // try next candidate
        }
      }
    }
    return pwshPath
  }

  function scriptAvailable(): boolean {
    return existsSync(path.join(opts.sourceDir, 'Approver.ps1'))
  }

  function isAvailable(): boolean {
    return isWindows && scriptAvailable() && resolvePwsh() !== null
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
    const pwsh = resolvePwsh()
    if (!pwsh) {
      lastError = 'PowerShell (pwsh/powershell) not found on PATH.'
      return
    }
    deploy()
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', deployedScript]
    if (desired.classify) args.push('-Classify')
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
