import { describe, it, expect } from 'vitest'
import { projectNameValidator } from '../../../src/core/projects/projectNameValidator'

describe('ProjectNameValidator', () => {
  it('Empty_IsRejected_EmptyString', () => {
    const err = projectNameValidator.getError('', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('empty')
  })

  it('Empty_IsRejected_Whitespace', () => {
    const err = projectNameValidator.getError('   ', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('empty')
  })

  it('InvalidCharacter_LessThan', () => {
    const err = projectNameValidator.getError('bad<name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_Pipe', () => {
    const err = projectNameValidator.getError('bad|name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_QuestionMark', () => {
    const err = projectNameValidator.getError('bad?name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_Backslash', () => {
    const err = projectNameValidator.getError('bad\\name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_Colon', () => {
    const err = projectNameValidator.getError('bad:name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_GreaterThan', () => {
    const err = projectNameValidator.getError('bad>name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_Quote', () => {
    const err = projectNameValidator.getError('bad"name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_ForwardSlash', () => {
    const err = projectNameValidator.getError('bad/name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('InvalidCharacter_Asterisk', () => {
    const err = projectNameValidator.getError('bad*name', () => false)
    expect(err).not.toBeNull()
    expect(err!).toContain('invalid characters')
  })

  it('Duplicate_IsRejected', () => {
    const err = projectNameValidator.getError('Existing', () => true)
    expect(err).not.toBeNull()
    expect(err!).toContain('already exists')
  })

  it('ValidName_ReturnsNull', () => {
    const err = projectNameValidator.getError('My-New Project 2', () => false)
    expect(err).toBeNull()
  })

  it('ValidName_WithSpaces_ReturnsNull', () => {
    const err = projectNameValidator.getError('  My Project  ', () => false)
    expect(err).toBeNull()
  })

  it('ValidName_Trimmed_CheckedForExistence', () => {
    const checkedNames: string[] = []
    projectNameValidator.getError('  SpacedName  ', (name) => {
      checkedNames.push(name)
      return false
    })
    expect(checkedNames[0]).toBe('SpacedName')
  })

  it('DuplicateCheck_ReceivesTrimmedName', () => {
    const err = projectNameValidator.getError('  Existing  ', (name) => name === 'Existing')
    expect(err).not.toBeNull()
    expect(err!).toContain('already exists')
  })

  it('ErrorMessage_ContainsInvalidCharsDescription', () => {
    const err = projectNameValidator.getError('bad<name', () => false)
    expect(err).toBe('Project name contains invalid characters: < > : " / \\ | ? *')
  })

  it('ErrorMessage_EmptyIsCorrect', () => {
    const err = projectNameValidator.getError('', () => false)
    expect(err).toBe('Project name cannot be empty.')
  })
})
