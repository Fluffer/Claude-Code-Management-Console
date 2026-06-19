import { describe, it, expect } from 'vitest'
import { extract, stripInline, getDescription } from '../../../src/core/projects/projectDescription'

describe('ProjectDescription', () => {
  describe('extract', () => {
    it('HeadingThenParagraph_ReturnsParagraph', () => {
      const md = '# MyApi\n\nREST backend for invoice processing.\n\nMore text.'
      expect(extract(md)).toBe('REST backend for invoice processing.')
    })

    it('BadgesAndImagesSkipped', () => {
      const md = '# Tool\n\n[![CI](https://x/badge.svg)](https://x)\n![logo](logo.png)\n\nDoes useful things.'
      expect(extract(md)).toBe('Does useful things.')
    })

    it('CodeFenceContentSkipped', () => {
      const md = '# X\n```bash\ninstall me\n```\nActual description here.'
      expect(extract(md)).toBe('Actual description here.')
    })

    it('YamlFrontmatterSkipped', () => {
      const md = '---\ntitle: foo\ntags: [a, b]\n---\nDescription after frontmatter.'
      expect(extract(md)).toBe('Description after frontmatter.')
    })

    it('HtmlBlockquoteAndHrSkipped', () => {
      const md = '<p align="center">x</p>\n> quoted\n---\nReal text.'
      expect(extract(md)).toBe('Real text.')
    })

    it('LongLine_CappedAt200WithEllipsis', () => {
      const md = 'a'.repeat(300)
      const desc = extract(md)
      expect(desc).not.toBeNull()
      expect(desc!.length).toBe(201) // 200 chars + ellipsis
      expect(desc!.endsWith('…')).toBe(true)
    })

    it('EmptyAndWhitespaceOnly_ReturnsNull', () => {
      expect(extract('   \n\n  \t\n')).toBeNull()
    })

    it('HeadingsOnly_ReturnsNull', () => {
      expect(extract('# Title\n## Subtitle\n')).toBeNull()
    })
  })

  describe('stripInline', () => {
    it('StripsBoldLinksAndCode', () => {
      const result = stripInline('A **bold** tool with a [link](https://x.example) and `code`.')
      expect(result).toBe('A bold tool with a link and code.')
    })
  })

  describe('getDescription', () => {
    it('HeadingThenParagraph_ReturnsParagraph', () => {
      const readme = '# MyApi\n\nREST backend for invoice processing.\n\nMore text.'
      expect(getDescription(readme, null)).toBe('REST backend for invoice processing.')
    })

    it('BadgesAndImagesSkipped', () => {
      const readme = '# Tool\n\n[![CI](https://x/badge.svg)](https://x)\n![logo](logo.png)\n\nDoes useful things.'
      expect(getDescription(readme, null)).toBe('Does useful things.')
    })

    it('HeadingsOnlyReadme_FallsBackToClaudeMd', () => {
      const readme = '# Title\n## Subtitle\n'
      const claudeMd = 'Guidance for the agent project.'
      expect(getDescription(readme, claudeMd)).toBe('Guidance for the agent project.')
    })

    it('NoReadme_UsesClaudeMd', () => {
      const claudeMd = '# Project\nCLI launcher for sessions.'
      expect(getDescription(null, claudeMd)).toBe('CLI launcher for sessions.')
    })

    it('NoFiles_ReturnsEmpty', () => {
      expect(getDescription(null, null)).toBe('')
    })

    it('EmptyAndWhitespaceFiles_ReturnEmpty', () => {
      expect(getDescription('   \n\n  \t\n', '')).toBe('')
    })

    it('CodeFenceContentSkipped', () => {
      const readme = '# X\n```bash\ninstall me\n```\nActual description here.'
      expect(getDescription(readme, null)).toBe('Actual description here.')
    })

    it('YamlFrontmatterSkipped', () => {
      const readme = '---\ntitle: foo\ntags: [a, b]\n---\nDescription after frontmatter.'
      expect(getDescription(readme, null)).toBe('Description after frontmatter.')
    })

    it('InlineMarkdownStripped', () => {
      const readme = 'A **bold** tool with a [link](https://x.example) and `code`.'
      expect(getDescription(readme, null)).toBe('A bold tool with a link and code.')
    })

    it('HtmlBlockquoteAndHrSkipped', () => {
      const readme = '<p align="center">x</p>\n> quoted\n---\nReal text.'
      expect(getDescription(readme, null)).toBe('Real text.')
    })

    it('LongLine_CappedAt200WithEllipsis', () => {
      const readme = 'a'.repeat(300)
      const desc = getDescription(readme, null)
      expect(desc.length).toBe(201) // 200 chars + ellipsis
      expect(desc.endsWith('…')).toBe(true)
    })
  })
})
