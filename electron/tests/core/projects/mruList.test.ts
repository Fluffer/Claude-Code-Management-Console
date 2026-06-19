import { describe, it, expect } from 'vitest'
import { mruAdd } from '../../../src/core/projects/mruList'

describe('MruList', () => {
  it('Add_MovesToFrontAndDedups', () => {
    const list = ['C:\\b', 'C:\\a']
    const result = mruAdd(list, 'C:\\a', 5)
    expect(result).toEqual(['C:\\a', 'C:\\b'])
  })

  it('Add_DedupsCaseInsensitively', () => {
    const result = mruAdd(['C:\\A'], 'c:\\a', 5)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('c:\\a')
  })

  it('Add_RespectsCap', () => {
    const list = ['C:\\1', 'C:\\2', 'C:\\3']
    const result = mruAdd(list, 'C:\\4', 3)
    expect(result).toEqual(['C:\\4', 'C:\\1', 'C:\\2'])
  })
})
