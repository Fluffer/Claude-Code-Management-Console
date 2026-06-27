/**
 * Integration test for the auto-approver lifecycle service.
 *
 * Windows-only. Spawns the REAL Approver.ps1 daemon but first seeds a
 * mode="off" config into the work dir so the daemon only detects+logs and never
 * presses keys into live terminals during the test.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createApproverService, type IApproverService } from '../../../src/main/services/approverService'

const sourceDir = path.resolve('..', 'tools', 'terminal-auto-approver')
const isWin = process.platform === 'win32'

let svc: IApproverService | null = null
let workDir: string | null = null

afterEach(() => {
  svc?.dispose()
  svc = null
  if (workDir) {
    try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
    workDir = null
  }
})

async function waitFor(pred: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true
    await new Promise((r) => setTimeout(r, 150))
  }
  return pred()
}

describe.runIf(isWin)('approverService (windows)', () => {
  it('deploys, starts the daemon (mode=off), then stops on dispose', async () => {
    workDir = mkdtempSync(path.join(os.tmpdir(), 'approver-test-'))
    mkdirSync(workDir, { recursive: true })

    // Seed a mode=off config so the spawned daemon never presses keys.
    const cfg = JSON.parse(readFileSync(path.join(sourceDir, 'config.json'), 'utf8'))
    cfg.policy.mode = 'off'
    writeFileSync(path.join(workDir, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8')

    svc = createApproverService({ sourceDir, workDir })
    await svc.init()
    expect(svc.status().available).toBe(true)

    const result = await svc.set({ enabled: true })
    expect(result.enabled).toBe(true)

    // Daemon process is alive and the script was deployed.
    const running = await waitFor(() => svc!.status().running)
    expect(running).toBe(true)
    expect(existsSync(path.join(workDir, 'Approver.ps1'))).toBe(true)

    // Persisted desired state written.
    const persisted = JSON.parse(readFileSync(path.join(workDir, 'service.json'), 'utf8'))
    expect(persisted.enabled).toBe(true)

    // The deployed daemon actually ran our off-config (proves real launch).
    const logged = await waitFor(() => {
      const log = path.join(workDir!, 'approver.log')
      return existsSync(log) && readFileSync(log, 'utf8').includes('mode=off')
    })
    expect(logged).toBe(true)

    // Stop.
    svc.dispose()
    const stopped = await waitFor(() => !svc!.status().running, 4000)
    expect(stopped).toBe(true)
  }, 20000)

  it('reports unavailable cleanly when the script is missing', async () => {
    workDir = mkdtempSync(path.join(os.tmpdir(), 'approver-test-'))
    const emptySource = mkdtempSync(path.join(os.tmpdir(), 'approver-src-'))
    svc = createApproverService({ sourceDir: emptySource, workDir })
    await svc.init()
    const s = await svc.set({ enabled: true })
    expect(s.available).toBe(false)
    expect(s.running).toBe(false)
    expect(s.error).toBeTruthy()
    try { rmSync(emptySource, { recursive: true, force: true }) } catch { /* ignore */ }
  }, 15000)
})
