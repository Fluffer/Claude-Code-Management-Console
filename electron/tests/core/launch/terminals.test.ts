import { describe, it, expect } from 'vitest'
import {
  getTerminal,
  terminalsForPlatform,
  WINDOWS_TERMINAL_EXE,
  TERMINALS,
} from '../../../src/core/launch/terminals'

const BASE = {
  terminalPath: 'C:\\wt.exe',
  shell: 'pwsh',
  projectName: 'my-proj',
  projectPath: 'C:\\dev\\my-proj',
  claudeCommand: "claude -n 'my-proj'",
}

describe('terminals registry', () => {
  it('looks up known terminals by id', () => {
    expect(getTerminal('wt')?.name).toBe('Windows Terminal')
    expect(getTerminal('wtai')?.name).toBe('Windows Terminal AI')
    expect(getTerminal('nope')).toBeNull()
  })

  it('filters by platform', () => {
    const win = terminalsForPlatform('win32').map((t) => t.id)
    expect(win).toEqual(['wt', 'wtai'])
    const mac = terminalsForPlatform('darwin').map((t) => t.id)
    expect(mac).toContain('terminal-app')
    expect(mac).not.toContain('wt')
  })

  it('maps windows ids to executables', () => {
    expect(WINDOWS_TERMINAL_EXE.wt).toBe('wt.exe')
    expect(WINDOWS_TERMINAL_EXE.wtai).toBe('wtai.exe')
  })
})

describe('wt / wtai buildSpec', () => {
  it('wt builds a Windows Terminal new-tab spec using the resolved path', () => {
    const spec = getTerminal('wt')!.buildSpec(BASE)
    expect(spec.filePath).toBe('C:\\wt.exe')
    expect(spec.workingDirectory).toBeNull()
    expect(spec.arguments).toContain('new-tab')
    expect(spec.arguments).toContain('--title')
    expect(spec.arguments).toContain('-NoExit')
    expect(spec.arguments).toContain('pwsh')
  })

  it('wtai produces the same arg shape but uses its own resolved path', () => {
    const spec = getTerminal('wtai')!.buildSpec({ ...BASE, terminalPath: 'C:\\wtai.exe' })
    expect(spec.filePath).toBe('C:\\wtai.exe')
    expect(spec.arguments).toContain('new-tab')
  })
})

describe('macOS stubs', () => {
  it('throw a clear not-implemented error if ever invoked', () => {
    for (const t of TERMINALS.filter((x) => x.platform === 'darwin')) {
      expect(() => t.buildSpec(BASE)).toThrow(/not yet implemented/i)
    }
  })
})
