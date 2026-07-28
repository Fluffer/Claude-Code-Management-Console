/**
 * The auto-approver daemon presses keys in the user's terminal tabs, so it must
 * never outlive the app that owns it. A clean quit is handled by dispose(); this
 * covers the case that actually bit — a crash or force-kill, where no shutdown
 * code runs at all — by launching the REAL script and killing its parent.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const sourceDir = path.resolve('..', 'tools', 'terminal-auto-approver')
const isWin = process.platform === 'win32'

let workDir: string | null = null
const spawned: number[] = []

afterEach(() => {
  for (const pid of spawned.splice(0)) {
    try { process.kill(pid) } catch { /* already gone */ }
  }
  if (workDir) {
    try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
    workDir = null
  }
})

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitFor(pred: () => boolean, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return pred()
}

/** Deploys the real script with a mode=off config so it never presses keys. */
function deployHarmlessDaemon(): string {
  workDir = mkdtempSync(path.join(os.tmpdir(), 'approver-watchdog-'))
  mkdirSync(workDir, { recursive: true })
  const cfg = JSON.parse(readFileSync(path.join(sourceDir, 'config.json'), 'utf8'))
  cfg.policy.mode = 'off'
  writeFileSync(path.join(workDir, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8')
  copyFileSync(path.join(sourceDir, 'Approver.ps1'), path.join(workDir, 'Approver.ps1'))
  return path.join(workDir, 'Approver.ps1')
}

describe.runIf(isWin)('approver daemon parent watchdog', () => {
  it('exits when the process that launched it disappears', async () => {
    const script = deployHarmlessDaemon()

    // A stand-in "app" process for the daemon to watch.
    const parent = spawn('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 120'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    spawned.push(parent.pid as number)

    const daemon = spawn(
      'pwsh',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
       '-File', script, '-ParentPid', String(parent.pid)],
      { cwd: workDir as string, windowsHide: true, stdio: 'ignore' },
    )
    const daemonPid = daemon.pid as number
    spawned.push(daemonPid)

    expect(await waitFor(() => isAlive(daemonPid), 5000)).toBe(true)

    // Force-kill the parent, exactly as a crash would — no shutdown code runs.
    execFileSync('taskkill', ['/PID', String(parent.pid), '/T', '/F'], { windowsHide: true })

    // The daemon must notice and stop on its own.
    expect(await waitFor(() => !isAlive(daemonPid))).toBe(true)
  }, 40000)

  it('refuses to start at all when the parent is already gone', async () => {
    const script = deployHarmlessDaemon()

    // A pid that has already exited.
    const shortLived = spawn('powershell', ['-NoProfile', '-Command', 'exit'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    const deadPid = shortLived.pid as number
    await new Promise<void>((r) => shortLived.on('exit', () => r()))

    const daemon = spawn(
      'pwsh',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
       '-File', script, '-ParentPid', String(deadPid)],
      { cwd: workDir as string, windowsHide: true, stdio: 'ignore' },
    )
    const daemonPid = daemon.pid as number
    spawned.push(daemonPid)

    expect(await waitFor(() => !isAlive(daemonPid))).toBe(true)
  }, 40000)

  it('keeps running while the parent is alive', async () => {
    const script = deployHarmlessDaemon()

    const parent = spawn('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 120'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    spawned.push(parent.pid as number)

    const daemon = spawn(
      'pwsh',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
       '-File', script, '-ParentPid', String(parent.pid)],
      { cwd: workDir as string, windowsHide: true, stdio: 'ignore' },
    )
    const daemonPid = daemon.pid as number
    spawned.push(daemonPid)

    await new Promise<void>((r) => setTimeout(r, 6000))
    expect(isAlive(daemonPid)).toBe(true)
  }, 40000)
})
