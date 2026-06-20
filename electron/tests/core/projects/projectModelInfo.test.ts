import { describe, it, expect } from 'vitest'
import { readModel, resolveDefaultModel } from '../../../src/core/projects/projectModelInfo'

describe('ProjectModelInfo', () => {
  describe('readModel', () => {
    it('ReturnsModel_WhenPresent', () => {
      expect(readModel('{"model":"opus"}')).toBe('opus')
    })

    it('ReturnsNull_WhenModelAbsent', () => {
      expect(readModel('{"permissions":{"defaultMode":"auto"}}')).toBeNull()
    })

    it('ReturnsNull_WhenModelIsBlank', () => {
      expect(readModel('{"model":"   "}')).toBeNull()
    })

    it('ReturnsNull_OnGarbageJson', () => {
      expect(readModel('not json at all')).toBeNull()
    })

    it('ReturnsNull_OnNull', () => {
      expect(readModel(null)).toBeNull()
    })

    it('ReturnsNull_WhenNoModelKeyInThemeOnly', () => {
      expect(readModel('{"theme":"auto"}')).toBeNull()
    })
  })

  describe('resolveDefaultModel', () => {
    it('ProjectModel_WinsOverUser', () => {
      const project = '{"model":"opus"}'
      const user = '{"model":"sonnet"}'
      expect(resolveDefaultModel(project, user)).toBe('opus')
    })

    it('FallsBackToUserSettings_WhenProjectHasNoModel', () => {
      const project = '{"permissions":{"defaultMode":"auto"}}'
      const user = '{"model":"haiku"}'
      expect(resolveDefaultModel(project, user)).toBe('haiku')
    })

    it('Null_WhenNoModelConfiguredAnywhere', () => {
      expect(resolveDefaultModel('{"theme":"auto"}', '{"theme":"auto"}')).toBeNull()
    })

    it('Null_WhenNothingExists', () => {
      expect(resolveDefaultModel(null, null)).toBeNull()
    })

    it('NeverThrows_OnGarbageJson_FallsThroughToUser', () => {
      const user = '{"model":"sonnet"}'
      expect(resolveDefaultModel('not json at all', user)).toBe('sonnet')
    })

    it('Null_WhenModelIsBlank', () => {
      expect(resolveDefaultModel('{"model":"   "}', null)).toBeNull()
    })
  })
})
