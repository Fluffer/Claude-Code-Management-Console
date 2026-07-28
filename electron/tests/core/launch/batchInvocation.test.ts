import { describe, it, expect } from 'vitest'
import {
  isBatchCommand,
  buildInvocation,
  BATCH_PERCENT_MESSAGE,
} from '../../../src/core/launch/batchInvocation'

describe('isBatchCommand', () => {
  it('is true for .cmd and .bat on win32 (case-insensitive)', () => {
    expect(isBatchCommand('C:\\tools\\code.cmd', 'win32')).toBe(true)
    expect(isBatchCommand('C:\\tools\\npx.CMD', 'win32')).toBe(true)
    expect(isBatchCommand('C:\\tools\\thing.BAT', 'win32')).toBe(true)
  })

  it('is false for executables and extension-less commands', () => {
    expect(isBatchCommand('C:\\tools\\code.exe', 'win32')).toBe(false)
    expect(isBatchCommand('C:\\tools\\claude', 'win32')).toBe(false)
    expect(isBatchCommand('git', 'win32')).toBe(false)
  })

  it('is false on non-Windows platforms even for a .cmd name', () => {
    expect(isBatchCommand('/usr/bin/code.cmd', 'darwin')).toBe(false)
  })

  it('does not treat a .cmd substring inside a directory name as a batch file', () => {
    expect(isBatchCommand('C:\\a.cmd\\tool.exe', 'win32')).toBe(false)
  })
})

describe('buildInvocation — passthrough', () => {
  it('returns the command untouched when it is not a batch file', () => {
    const inv = buildInvocation('C:\\tools\\code.exe', ['C:\\My Projects\\app'], {
      platform: 'win32',
    })
    expect(inv).toEqual({
      file: 'C:\\tools\\code.exe',
      args: ['C:\\My Projects\\app'],
      windowsVerbatimArguments: false,
    })
  })

  it('passes through on non-Windows platforms', () => {
    const inv = buildInvocation('/usr/local/bin/npx', ['-y', 'server'], { platform: 'darwin' })
    expect(inv).toEqual({
      file: '/usr/local/bin/npx',
      args: ['-y', 'server'],
      windowsVerbatimArguments: false,
    })
  })

  it('copies the args array rather than aliasing the input', () => {
    const args = ['a']
    const inv = buildInvocation('tool.exe', args, { platform: 'win32' })
    expect(inv.args).not.toBe(args)
  })
})

describe('buildInvocation — batch wrapping', () => {
  it('routes a .cmd through cmd.exe with verbatim arguments', () => {
    const inv = buildInvocation('C:\\VSCode\\bin\\code.cmd', ['C:\\Dev\\app'], {
      platform: 'win32',
      comSpec: 'C:\\Windows\\system32\\cmd.exe',
    })
    expect(inv.file).toBe('C:\\Windows\\system32\\cmd.exe')
    expect(inv.windowsVerbatimArguments).toBe(true)
    expect(inv.args.slice(0, 4)).toEqual(['/d', '/v:off', '/s', '/c'])
    expect(inv.args).toHaveLength(5)
  })

  it('wraps the whole command line in one outer quoted token (cmd /s rule)', () => {
    const inv = buildInvocation('C:\\VSCode\\bin\\code.cmd', ['C:\\Dev\\app'], {
      platform: 'win32',
    })
    const line = inv.args[4]
    expect(line.startsWith('"')).toBe(true)
    expect(line.endsWith('"')).toBe(true)
    expect(line).toBe('"C:\\VSCode\\bin\\code.cmd C:\\Dev\\app"')
  })

  it('falls back to cmd.exe when ComSpec is not provided', () => {
    const inv = buildInvocation('a.cmd', [], { platform: 'win32' })
    expect(inv.file).toBe('cmd.exe')
  })

  it('quotes tokens containing spaces', () => {
    const inv = buildInvocation('C:\\Program Files\\VS Code\\bin\\code.cmd', [
      'C:\\My Projects\\app',
    ], { platform: 'win32' })
    expect(inv.args[4]).toBe(
      '""C:\\Program Files\\VS Code\\bin\\code.cmd" "C:\\My Projects\\app""',
    )
  })

  it('quotes cmd metacharacters so they are not interpreted as operators', () => {
    const inv = buildInvocation('npx.cmd', ['a&whoami', 'b|c', 'd>e', 'f^g', '(h)'], {
      platform: 'win32',
    })
    const line = inv.args[4]
    expect(line).toContain('"a&whoami"')
    expect(line).toContain('"b|c"')
    expect(line).toContain('"d>e"')
    expect(line).toContain('"f^g"')
    expect(line).toContain('"(h)"')
  })

  it('escapes embedded double quotes per CommandLineToArgvW rules', () => {
    const inv = buildInvocation('npx.cmd', ['say "hi"'], { platform: 'win32' })
    expect(inv.args[4]).toBe('"npx.cmd "say \\"hi\\"""')
  })

  it('doubles a trailing backslash run so it does not escape the closing quote', () => {
    const inv = buildInvocation('npx.cmd', ['C:\\path with space\\'], { platform: 'win32' })
    expect(inv.args[4]).toBe('"npx.cmd "C:\\path with space\\\\""')
  })

  it('leaves plain tokens unquoted', () => {
    const inv = buildInvocation('npx.cmd', ['-y', '@scope/pkg-name_1.2'], { platform: 'win32' })
    expect(inv.args[4]).toBe('"npx.cmd -y "@scope/pkg-name_1.2""')
  })

  it('emits an explicit empty-string token', () => {
    const inv = buildInvocation('npx.cmd', [''], { platform: 'win32' })
    expect(inv.args[4]).toBe('"npx.cmd """')
  })

  it('disables delayed expansion so ! in an argument stays literal', () => {
    const inv = buildInvocation('npx.cmd', ['a!b!'], { platform: 'win32' })
    expect(inv.args).toContain('/v:off')
    expect(inv.args[4]).toContain('"a!b!"')
  })

  it('throws on % because cmd.exe expands variables even inside quotes', () => {
    expect(() => buildInvocation('npx.cmd', ['C:\\100%\\app'], { platform: 'win32' })).toThrow(
      BATCH_PERCENT_MESSAGE,
    )
    expect(() => buildInvocation('C:\\100%\\code.cmd', [], { platform: 'win32' })).toThrow(
      BATCH_PERCENT_MESSAGE,
    )
  })

  it('allows % when the command is not a batch file (no cmd.exe involved)', () => {
    expect(() => buildInvocation('code.exe', ['C:\\100%\\app'], { platform: 'win32' })).not.toThrow()
  })
})
