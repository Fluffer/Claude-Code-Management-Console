import { describe, it, expect } from 'vitest'
import { generateSnapshotFilename, selectFilesToPrune } from '../../../src/core/config/configSnapshot'

describe('ConfigSnapshot', () => {
  describe('generateSnapshotFilename', () => {
    it('Write_CreatesTimestampedFilename', () => {
      // Mirrors C# test: stamp = new DateTime(2026, 6, 9, 14, 30, 0, DateTimeKind.Utc)
      const stamp = new Date(Date.UTC(2026, 5, 9, 14, 30, 0)) // month is 0-indexed in JS
      const name = generateSnapshotFilename(stamp)
      expect(name).toBe('config-20260609-143000.json')
      expect(name).toContain('20260609-143000')
    })

    it('pads single-digit month and day', () => {
      const stamp = new Date(Date.UTC(2026, 0, 5, 8, 5, 3)) // Jan 5, 08:05:03
      expect(generateSnapshotFilename(stamp)).toBe('config-20260105-080503.json')
    })
  })

  describe('selectFilesToPrune', () => {
    it('Write_PrunesToMostRecentN_returns_stale_filenames', () => {
      // 12 files, keep 10 → 2 to prune (oldest two, i.e. lowest lex names).
      // Use generateSnapshotFilename to produce realistic HHmmss-format names.
      const base = new Date(Date.UTC(2026, 5, 9, 0, 0, 0))
      const files: string[] = []
      for (let i = 0; i < 12; i++) {
        const stamp = new Date(base.getTime() + i * 60_000) // +i minutes
        files.push(generateSnapshotFilename(stamp))
      }
      // files[0] = config-20260609-000000.json (oldest)
      // files[1] = config-20260609-000100.json
      // files[11] = config-20260609-001100.json (newest)
      const toDelete = selectFilesToPrune(files, 10)
      expect(toDelete).toHaveLength(2)
      // The two pruned must be the oldest (lowest lex = smallest timestamp)
      expect(toDelete).toContain('config-20260609-000000.json')
      expect(toDelete).toContain('config-20260609-000100.json')
    })

    it('no prune when fewer files than keep limit', () => {
      const files = ['config-20260609-143000.json', 'config-20260609-143001.json']
      const toDelete = selectFilesToPrune(files, 10)
      expect(toDelete).toHaveLength(0)
    })

    it('returns empty list when files is empty', () => {
      expect(selectFilesToPrune([], 10)).toHaveLength(0)
    })
  })
})
