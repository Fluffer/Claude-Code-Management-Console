import { describe, it, expect } from 'vitest'
import { withFileLock, pendingLockCount } from '../../../src/main/os/fileMutex'

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('withFileLock', () => {
  it('serializes operations on the same path', async () => {
    const events: string[] = []

    const slow = withFileLock('C:\\x\\config.json', async () => {
      events.push('a:start')
      await tick(20)
      events.push('a:end')
    })
    const fast = withFileLock('C:\\x\\config.json', async () => {
      events.push('b:start')
      events.push('b:end')
    })

    await Promise.all([slow, fast])
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('prevents a lost update in a read-modify-write race', async () => {
    let stored = 0
    const read = async (): Promise<number> => {
      await tick(10)
      return stored
    }
    const write = async (v: number): Promise<void> => {
      await tick(10)
      stored = v
    }

    // Both increments read-modify-write the same "file".
    await Promise.all([
      withFileLock('state.json', async () => write((await read()) + 1)),
      withFileLock('state.json', async () => write((await read()) + 1)),
    ])

    expect(stored).toBe(2)
  })

  it('runs operations on different paths concurrently', async () => {
    const events: string[] = []

    await Promise.all([
      withFileLock('a.json', async () => {
        events.push('a:start')
        await tick(20)
        events.push('a:end')
      }),
      withFileLock('b.json', async () => {
        events.push('b:start')
        await tick(0)
        events.push('b:end')
      }),
    ])

    // b finishes while a is still waiting — proof they did not serialize
    expect(events.indexOf('b:end')).toBeLessThan(events.indexOf('a:end'))
  })

  it('treats paths case-insensitively and ignores trailing separators', async () => {
    const events: string[] = []

    const first = withFileLock('C:\\X\\Config.json', async () => {
      events.push('first:start')
      await tick(20)
      events.push('first:end')
    })
    const second = withFileLock('c:\\x\\config.json\\', async () => {
      events.push('second:start')
    })

    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('returns the operation result to its own caller', async () => {
    await expect(withFileLock('r.json', async () => 'value')).resolves.toBe('value')
  })

  it('propagates the operation error to its own caller', async () => {
    await expect(withFileLock('e.json', async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })

  it('keeps running later operations after one fails', async () => {
    const failing = withFileLock('f.json', async () => { throw new Error('nope') })
    const following = withFileLock('f.json', async () => 'still runs')

    await expect(failing).rejects.toThrow('nope')
    await expect(following).resolves.toBe('still runs')
  })

  it('releases the queue entry once the path drains', async () => {
    await withFileLock('drain.json', async () => undefined)
    await tick(0)
    expect(pendingLockCount()).toBe(0)
  })
})
