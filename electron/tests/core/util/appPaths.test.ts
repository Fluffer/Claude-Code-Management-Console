import { describe, it, expect } from 'vitest'
import { getAppDataDir, getConfigPath, getStatePath } from '../../../src/core/util/appPaths'
import * as path from 'path'

describe('AppPaths', () => {
  it('getAppDataDir_AppendsAppDataFolderName', () => {
    const base = 'C:\\Users\\Peter\\AppData\\Roaming'
    const dir = getAppDataDir(base)
    expect(dir).toBe(path.join(base, 'ccmc'))
  })

  it('getAppDataDir_ComposesWithPathJoin', () => {
    const base = path.join('Users', 'peter', '.config')
    const dir = getAppDataDir(base)
    expect(dir).toBe(path.join(base, 'ccmc'))
  })

  it('getConfigPath_ComposesUnderAppDataDir', () => {
    const base = 'C:\\Users\\Peter\\AppData\\Roaming'
    const configPath = getConfigPath(base)
    expect(configPath).toBe(path.join(base, 'ccmc', 'config.json'))
  })

  it('getStatePath_ComposesUnderAppDataDir', () => {
    const base = 'C:\\Users\\Peter\\AppData\\Roaming'
    const statePath = getStatePath(base)
    expect(statePath).toBe(path.join(base, 'ccmc', 'state.json'))
  })

  it('getConfigPath_PlatformPath', () => {
    const base = path.join('home', 'peter', '.config')
    const configPath = getConfigPath(base)
    expect(configPath).toBe(path.join(base, 'ccmc', 'config.json'))
  })

  it('getStatePath_PlatformPath', () => {
    const base = path.join('home', 'peter', '.config')
    const statePath = getStatePath(base)
    expect(statePath).toBe(path.join(base, 'ccmc', 'state.json'))
  })

  it('AppDataFolderName_IsccmcLowercase', () => {
    // Matches C# AppPaths.AppDataFolderName = "ccmc"
    const dir = getAppDataDir('C:\\base')
    expect(path.basename(dir)).toBe('ccmc')
  })

  it('getConfigPath_FileNameIsConfig', () => {
    const configPath = getConfigPath('C:\\base')
    expect(path.basename(configPath)).toBe('config.json')
  })

  it('getStatePath_FileNameIsState', () => {
    const statePath = getStatePath('C:\\base')
    expect(path.basename(statePath)).toBe('state.json')
  })
})
