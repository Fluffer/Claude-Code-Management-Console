import { describe, it, expect } from 'vitest'
import { createTerminalLauncher } from '../../../src/main/os/terminalLauncher'
import { MacTerminalLauncher } from '../../../src/main/os/terminalLauncher.mac'
import { buildLaunchSpec } from '../../../src/core/launch/launchCommandBuilder'
import { parseArgString } from '../../../src/main/os/terminalLauncher.win'
import { joinArgs } from '../../../src/core/launch/argumentEscaper'

describe('terminalLauncher argv security', () => {
  it('a project path with injection chars is passed as a single argv element, not interpreted', () => {
    // Verify via buildLaunchSpec that the malicious path appears verbatim in the
    // arguments string — it cannot break out because we use argv arrays not shell strings.
    const maliciousPath = 'C:\\Dev\\My Proj" & calc.exe'
    const spec = buildLaunchSpec({
      projectName: 'test',
      projectPath: maliciousPath,
      flags: '',
      continueSession: false,
      shell: 'powershell',
      wtPath: 'C:\\Windows\\system32\\wt.exe',
    })

    // The arguments string must contain the malicious path quoted so the quote
    // and ampersand cannot be interpreted by CreateProcess argv parsing.
    // The path appears as a -d argument to wt.exe — verify it is in the args string.
    expect(spec.arguments).toContain('"C:\\Dev\\My Proj\\" & calc.exe"')
    // AND the argument string must NOT allow a bare unquoted & to appear
    // between the -d flag and its value.
    const afterD = spec.arguments.split('-d ')[1]
    expect(afterD).not.toMatch(/^[^"]*&/)
  })

  it('a project path with semicolons is passed as a single argv element', () => {
    const maliciousPath = 'C:\\Dev\\; rm -rf /'
    const spec = buildLaunchSpec({
      projectName: 'test',
      projectPath: maliciousPath,
      flags: '',
      continueSession: false,
      shell: 'powershell',
      wtPath: null,
    })
    // Shell-only: workingDirectory is set on the process, not embedded in argv
    expect(spec.workingDirectory).toBe(maliciousPath)
    // The arguments string only contains shell flags, NOT the path
    expect(spec.arguments).not.toContain(maliciousPath)
  })

  it('buildLaunchSpec with wtPath produces wt.exe as filePath', () => {
    const spec = buildLaunchSpec({
      projectName: 'MyProject',
      projectPath: 'C:\\Dev\\MyProject',
      flags: '',
      continueSession: false,
      shell: 'pwsh',
      wtPath: 'C:\\Windows\\system32\\wt.exe',
    })
    expect(spec.filePath).toBe('C:\\Windows\\system32\\wt.exe')
    expect(spec.arguments).toContain('-w')
    expect(spec.arguments).toContain('0')
    expect(spec.arguments).toContain('new-tab')
  })

  it('buildLaunchSpec without wtPath produces shell as filePath', () => {
    const spec = buildLaunchSpec({
      projectName: 'MyProject',
      projectPath: 'C:\\Dev\\MyProject',
      flags: '',
      continueSession: false,
      shell: 'powershell',
      wtPath: null,
    })
    expect(spec.filePath).toBe('powershell')
    expect(spec.workingDirectory).toBe('C:\\Dev\\MyProject')
    expect(spec.arguments).toContain('-NoExit')
  })
})

describe('terminalLauncher (Windows)', () => {
  it('createTerminalLauncher returns an object with launch method', () => {
    const launcher = createTerminalLauncher()
    expect(typeof launcher.launch).toBe('function')
  })
})

describe('parseArgString argv roundtrip', () => {
  it('roundtrips plain args through joinArgs -> parseArgString', () => {
    const original = ['-w', '0', 'new-tab', '--title', 'My Project', '-d', 'C:\\Dev\\My Project']
    const joined = joinArgs(original)
    const parsed = parseArgString(joined)
    expect(parsed).toEqual(original)
  })

  it('roundtrips args with injection chars (the security invariant)', () => {
    const original = ['-w', '0', '-d', 'C:\\Dev\\My Proj" & calc.exe', 'powershell', '-NoExit', '-Command', 'claude']
    const joined = joinArgs(original)
    const parsed = parseArgString(joined)
    expect(parsed).toEqual(original)
    // The injection path must appear as a single element, not split into multiple args
    expect(parsed[3]).toBe('C:\\Dev\\My Proj" & calc.exe')
  })

  it('roundtrips empty arg', () => {
    const original = ['--name', '']
    const joined = joinArgs(original)
    const parsed = parseArgString(joined)
    expect(parsed).toEqual(original)
  })

  it('roundtrips arg with backslashes before a quote', () => {
    const original = ['C:\\Users\\foo\\', 'other']
    const joined = joinArgs(original)
    const parsed = parseArgString(joined)
    expect(parsed).toEqual(original)
  })
})

describe('terminalLauncher mac stub', () => {
  it('launch throws mac not-implemented error', async () => {
    const stub = new MacTerminalLauncher()
    const spec = { filePath: 'open', arguments: '', workingDirectory: null }
    await expect(stub.launch(spec)).rejects.toThrow('macOS not implemented yet')
  })
})
