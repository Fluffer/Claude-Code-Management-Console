import { describe, it, expect } from 'vitest'
import {
  parseTasklistCsv,
  parseWmicProcessOutput,
  filterClaudeSessions,
} from '../../../src/core/os/processOutputParser'

describe('parseTasklistCsv', () => {
  it('parses a single tasklist /v /fo csv row', () => {
    const csv = [
      '"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"',
      '"node.exe","1234","Console","1","50,000 K","Running","MACHINE\\user","0:00:01","N/A"',
    ].join('\r\n')

    const entries = parseTasklistCsv(csv)
    expect(entries).toHaveLength(1)
    expect(entries[0].pid).toBe(1234)
    expect(entries[0].name).toBe('node.exe')
  })

  it('parses multiple rows', () => {
    const csv = [
      '"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"',
      '"node.exe","1234","Console","1","50,000 K","Running","MACHINE\\user","0:00:01","N/A"',
      '"claude.exe","5678","Console","1","30,000 K","Running","MACHINE\\user","0:00:02","N/A"',
    ].join('\r\n')

    const entries = parseTasklistCsv(csv)
    expect(entries).toHaveLength(2)
    expect(entries[1].pid).toBe(5678)
    expect(entries[1].name).toBe('claude.exe')
  })

  it('skips header-only output with no data rows', () => {
    const csv = '"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"'
    const entries = parseTasklistCsv(csv)
    expect(entries).toHaveLength(0)
  })

  it('handles empty string', () => {
    expect(parseTasklistCsv('')).toHaveLength(0)
  })

  it('strips quotes from name', () => {
    const csv = [
      '"Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"',
      '"bun.exe","9999","Console","1","10,000 K","Running","MACHINE\\user","0:00:00","N/A"',
    ].join('\n')
    const entries = parseTasklistCsv(csv)
    expect(entries[0].name).toBe('bun.exe')
    expect(entries[0].pid).toBe(9999)
  })
})

describe('parseWmicProcessOutput', () => {
  it('parses CSV output with CommandLine and WorkingSetSize columns', () => {
    const csv = [
      'Caption,CommandLine,ParentProcessId,ProcessId,WorkingSetSize',
      'node.exe,"node C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js",4321,1234,51200000',
    ].join('\r\n')

    const entries = parseWmicProcessOutput(csv)
    expect(entries).toHaveLength(1)
    expect(entries[0].pid).toBe(1234)
    expect(entries[0].ppid).toBe(4321)
    expect(entries[0].name).toBe('node.exe')
    expect(entries[0].commandLine).toContain('claude-code')
  })

  it('handles empty output', () => {
    expect(parseWmicProcessOutput('')).toHaveLength(0)
  })

  it('skips rows with non-numeric PIDs', () => {
    const csv = [
      'Caption,CommandLine,ParentProcessId,ProcessId,WorkingSetSize',
      'svchost.exe,"svchost.exe -k NetworkService",bad,also-bad,4096',
    ].join('\r\n')
    expect(parseWmicProcessOutput(csv)).toHaveLength(0)
  })

  it('handles quoted commandLine with commas', () => {
    const csv = [
      'Caption,CommandLine,ParentProcessId,ProcessId,WorkingSetSize',
      'node.exe,"node.exe --flag=a,b",0,42,1024',
    ].join('\r\n')
    const entries = parseWmicProcessOutput(csv)
    expect(entries).toHaveLength(1)
    expect(entries[0].commandLine).toBe('node.exe --flag=a,b')
  })
})

describe('filterClaudeSessions', () => {
  const entries = [
    { pid: 1, ppid: 0, name: 'claude.exe', commandLine: 'claude.exe', workingDirectory: 'C:\\Dev\\A' },
    { pid: 2, ppid: 0, name: 'node.exe', commandLine: 'node C:\\...\\claude-code\\cli.js', workingDirectory: 'C:\\Dev\\B' },
    { pid: 3, ppid: 0, name: 'bun.exe', commandLine: 'bun C:\\...\\claude-code\\cli.js', workingDirectory: 'C:\\Dev\\C' },
    { pid: 4, ppid: 0, name: 'node.exe', commandLine: 'node other-app.js', workingDirectory: 'C:\\Dev\\D' },
    { pid: 5, ppid: 0, name: 'code.exe', commandLine: 'code.exe', workingDirectory: 'C:\\Dev\\E' },
  ]

  it('includes claude.exe processes unconditionally', () => {
    const result = filterClaudeSessions(entries)
    expect(result.some(s => s.pid === 1)).toBe(true)
  })

  it('includes node.exe processes whose command line contains claude', () => {
    const result = filterClaudeSessions(entries)
    expect(result.some(s => s.pid === 2)).toBe(true)
  })

  it('includes bun.exe processes whose command line contains claude', () => {
    const result = filterClaudeSessions(entries)
    expect(result.some(s => s.pid === 3)).toBe(true)
  })

  it('excludes node.exe processes not running claude', () => {
    const result = filterClaudeSessions(entries)
    expect(result.some(s => s.pid === 4)).toBe(false)
  })

  it('excludes unrelated processes', () => {
    const result = filterClaudeSessions(entries)
    expect(result.some(s => s.pid === 5)).toBe(false)
  })

  it('maps to RunningSession shape with trimmed workingDirectory', () => {
    const withTrailing = [
      { pid: 10, ppid: 0, name: 'claude.exe', commandLine: 'claude.exe', workingDirectory: 'C:\\Dev\\A\\' },
    ]
    const result = filterClaudeSessions(withTrailing)
    expect(result[0].workingDirectory).toBe('C:\\Dev\\A')
  })
})
