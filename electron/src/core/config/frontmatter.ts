/**
 * Minimal YAML-frontmatter parser for Claude capability files
 * (commands/*.md, skills/*\/SKILL.md). Extracts the leading `---` fenced
 * block into a flat key→value string map.
 *
 * Deliberately tiny: supports `key: value` lines only (no nesting, lists, or
 * multiline). Anything it can't parse is skipped. Never throws — a file with
 * no frontmatter yields an empty map, matching the defensive style of
 * mcpConfigReader.
 */
export function parseFrontmatter(md: string | null): Record<string, string> {
  const result: Record<string, string> = {}
  if (md === null) return result
  const text = md.replace(/^﻿/, '') // strip BOM
  if (!text.startsWith('---')) return result

  const lines = text.split(/\r?\n/)
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end === -1) return result

  for (let i = 1; i < end; i++) {
    const line = lines[i]
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (key === '') continue
    let value = line.slice(colon + 1).trim()
    if (
      value.length >= 2 &&
      (value[0] === '"' || value[0] === "'") &&
      value[value.length - 1] === value[0]
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}
