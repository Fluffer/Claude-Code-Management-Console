import { describe, it, expect } from 'vitest'
import { parseWorktrees, readBranchFromHead } from '../../../src/core/git/gitOutputParser'

describe('GitWorktreeParser', () => {
  it('Parse_TwoWorktrees_MainAndFeature', () => {
    const output =
      'worktree C:/Dev/Active/Foo\nHEAD abc123\nbranch refs/heads/main\n' +
      '\n' +
      'worktree C:/Dev/Active/Foo-feat\nHEAD def456\nbranch refs/heads/feature/x\n'

    const list = parseWorktrees(output)

    expect(list.length).toBe(2)
    expect(list[0].path).toBe('C:/Dev/Active/Foo')
    expect(list[0].branch).toBe('main')
    expect(list[0].isDetached).toBe(false)
    expect(list[1].branch).toBe('feature/x')
  })

  it('Parse_DetachedAndBare', () => {
    const output =
      'worktree C:/Dev/Bare\nbare\n' +
      '\n' +
      'worktree C:/Dev/Detached\nHEAD aaa111\ndetached\n'

    const list = parseWorktrees(output)

    expect(list.length).toBe(2)
    expect(list[0].isBare).toBe(true)
    expect(list[1].isDetached).toBe(true)
    expect(list[1].branch).toBeNull()
  })

  it('Parse_EmptyOutput_IsEmpty', () => {
    expect(parseWorktrees('')).toHaveLength(0)
  })

  it('Parse_CrLfLineEndings_AreNormalized', () => {
    const output =
      'worktree C:/Dev/Foo\r\nHEAD abc123\r\nbranch refs/heads/main\r\n' +
      '\r\n'

    const list = parseWorktrees(output)

    expect(list.length).toBe(1)
    expect(list[0].branch).toBe('main')
  })

  it('Parse_BranchWithoutRefsHeadsPrefix_RetainsFullName', () => {
    const output = 'worktree C:/Dev/Foo\nHEAD abc123\nbranch some/other/ref\n\n'

    const list = parseWorktrees(output)

    expect(list[0].branch).toBe('some/other/ref')
  })
})

describe('GitInfoParser', () => {
  it('ReadBranchFromHead_ParsesRef', () => {
    const headContent = 'ref: refs/heads/feature/x\n'
    const branch = readBranchFromHead(headContent)
    expect(branch).toBe('feature/x')
  })

  it('ReadBranchFromHead_DetachedHead_ReturnsShortHash', () => {
    const headContent = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0\n'
    const branch = readBranchFromHead(headContent)
    expect(branch).toBe('a1b2c3d')
  })

  it('ReadBranchFromHead_ShortHash_ReturnsWhole', () => {
    const headContent = 'abc\n'
    const branch = readBranchFromHead(headContent)
    expect(branch).toBe('abc')
  })

  it('ReadBranchFromHead_EmptyContent_ReturnsNull', () => {
    expect(readBranchFromHead('')).toBeNull()
  })
})
