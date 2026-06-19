import { describe, it, expect } from 'vitest'
import { createCommandLocator } from '../../../src/main/os/commandLocator'
import { MacCommandLocator } from '../../../src/main/os/commandLocator.mac'

describe('commandLocator (Windows integration)', () => {
  it('findOnPath resolves cmd.exe which always exists on Windows', async () => {
    const locator = createCommandLocator()
    const result = await locator.findOnPath('cmd.exe')
    expect(result).not.toBeNull()
    expect(result!.toLowerCase()).toContain('cmd.exe')
  })

  it('findOnPath returns null for a name that does not exist', async () => {
    const locator = createCommandLocator()
    const result = await locator.findOnPath('definitely-does-not-exist-xyz-abc-123.exe')
    expect(result).toBeNull()
  })

  it('getPreferredShell returns a non-empty string (pwsh or powershell)', async () => {
    const locator = createCommandLocator()
    const shell = await locator.getPreferredShell()
    expect(typeof shell).toBe('string')
    expect(shell.length).toBeGreaterThan(0)
    expect(['pwsh', 'powershell']).toContain(shell)
  })

  it('findWindowsTerminal returns a string path or null', async () => {
    const locator = createCommandLocator()
    const result = await locator.findWindowsTerminal()
    // wt.exe may or may not be installed; either is valid
    if (result !== null) {
      expect(result.toLowerCase()).toContain('wt.exe')
    } else {
      expect(result).toBeNull()
    }
  })

  it('findOnPath with extension-less name finds the exe (powershell)', async () => {
    const locator = createCommandLocator()
    const result = await locator.findOnPath('powershell')
    expect(result).not.toBeNull()
  })
})

describe('commandLocator mac stub', () => {
  it('findOnPath throws mac not-implemented error', async () => {
    const stub = new MacCommandLocator()
    await expect(stub.findOnPath('foo')).rejects.toThrow('macOS not implemented yet')
  })

  it('getPreferredShell throws mac not-implemented error', async () => {
    const stub = new MacCommandLocator()
    await expect(stub.getPreferredShell()).rejects.toThrow('macOS not implemented yet')
  })

  it('findWindowsTerminal throws mac not-implemented error', async () => {
    const stub = new MacCommandLocator()
    await expect(stub.findWindowsTerminal()).rejects.toThrow('macOS not implemented yet')
  })
})
