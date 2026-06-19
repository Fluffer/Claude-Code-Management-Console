import { describe, it, expect } from 'vitest'
import { parse, setKey, removeKey } from '../../../src/core/config/envFileEditor'

describe('EnvFileEditor', () => {
  it('Parse_KeysCommentsAndBlanks', () => {
    const text = '# header\nAPI_KEY=abc123\n\nMODE=dev # inline stays in value-ish\n'
    const entries = parse(text)
    expect(entries).toHaveLength(2)
    expect(entries[0].key).toBe('API_KEY')
    expect(entries[0].value).toBe('abc123')
    expect(entries[1].key).toBe('MODE')
  })

  it('SetKey_UpdatesExistingInPlace', () => {
    const text = '# header\nAPI_KEY=old\nMODE=dev\n'
    const updated = setKey(text, 'API_KEY', 'new')
    expect(updated).toBe('# header\nAPI_KEY=new\nMODE=dev\n')
  })

  it('SetKey_AppendsWhenAbsent', () => {
    const updated = setKey('A=1\n', 'B', '2')
    expect(updated).toBe('A=1\nB=2\n')
  })

  it('RemoveKey_DropsLineKeepsRest', () => {
    const updated = removeKey('# c\nA=1\nB=2\n', 'A')
    expect(updated).toBe('# c\nB=2\n')
  })
})
