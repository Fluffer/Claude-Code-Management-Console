import { describe, it, expect } from 'vitest'
import {
  encodeProjectPath,
  extractText,
  readFirstUserMessage,
  parseSessionEntries,
  type RawSessionEntry,
} from '../../../src/core/claude/sessionLister'

describe('ClaudeSessionLister', () => {
  describe('encodeProjectPath', () => {
    it('ReplacesNonAlphanumericWithDash', () => {
      expect(encodeProjectPath('C:\\Dev\\Proj')).toBe('C--Dev-Proj')
    })
  })

  describe('extractText', () => {
    it('ExtractsStringContent', () => {
      const line = JSON.stringify({ type: 'user', message: { role: 'user', content: 'first task here' } })
      expect(extractText(line)).toBe('first task here')
    })

    it('ExtractsArrayContent', () => {
      const line = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'second task' }] },
      })
      expect(extractText(line)).toBe('second task')
    })

    it('ReturnsNullOnGarbage', () => {
      expect(extractText('not json at all')).toBeNull()
    })

    it('ReturnsNullOnEmptyContent', () => {
      const line = JSON.stringify({ type: 'user', message: { role: 'user', content: [] } })
      expect(extractText(line)).toBeNull()
    })
  })

  describe('readFirstUserMessage', () => {
    it('ReturnsTruncatedAt120', () => {
      const long = 'x'.repeat(200)
      const line = JSON.stringify({ content: long })
      const result = readFirstUserMessage(line)
      expect(result.length).toBe(121) // 120 chars + ellipsis
      expect(result.endsWith('…')).toBe(true)
    })

    it('ReturnsEmptyOnGarbageLine', () => {
      expect(readFirstUserMessage('not json at all')).toBe('')
    })

    it('ReturnsEmptyOnEmptyLine', () => {
      expect(readFirstUserMessage('')).toBe('')
    })
  })

  describe('parseSessionEntries', () => {
    it('ListSessions_ReturnsIdMtimeAndFirstUserMessage_NewestFirst', () => {
      const olderTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      const newerTime = new Date(Date.now() - 5 * 60 * 1000).toISOString()

      const entries: RawSessionEntry[] = [
        {
          sessionId: '11111111-1111-1111-1111-111111111111',
          lastWriteUtc: olderTime,
          firstLine: JSON.stringify({ type: 'user', message: { role: 'user', content: 'first task here' } }),
        },
        {
          sessionId: '22222222-2222-2222-2222-222222222222',
          lastWriteUtc: newerTime,
          firstLine: JSON.stringify({
            type: 'user',
            message: { role: 'user', content: [{ type: 'text', text: 'second task' }] },
          }),
        },
      ]

      const list = parseSessionEntries(entries)

      expect(list).toHaveLength(2)
      expect(list[0].sessionId).toBe('22222222-2222-2222-2222-222222222222')
      expect(list[0].firstUserMessage).toBe('second task')
      expect(list[1].firstUserMessage).toBe('first task here')
    })

    it('ListSessions_NeverThrowsOnGarbageFirstLine', () => {
      const entries: RawSessionEntry[] = [
        {
          sessionId: '33333333-3333-3333-3333-333333333333',
          lastWriteUtc: new Date().toISOString(),
          firstLine: 'not json at all',
        },
      ]
      const list = parseSessionEntries(entries)
      expect(list).toHaveLength(1)
      expect(list[0].firstUserMessage).toBe('')
    })

    it('ListSessions_EmptyWhenNoEntries', () => {
      expect(parseSessionEntries([])).toHaveLength(0)
    })
  })
})
