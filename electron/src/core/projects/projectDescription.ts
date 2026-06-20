/**
 * Extracts a one-line project description from README.md (preferred) or CLAUDE.md content:
 * the first meaningful markdown line, with headings, badges, fences, frontmatter,
 * HTML and blockquotes skipped.
 *
 * The pure layer operates on file content strings.
 *
 * TODO Phase 3: implement get(projectPath) as an fs wrapper that:
 *   - reads up to 4096 bytes from README.md then CLAUDE.md
 *   - caches by file mtime
 *   - calls extract() on the content
 */

const MAX_LENGTH = 200
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g

/** Strips inline markdown (links, bold, code) from a line. */
export function stripInline(line: string): string {
  let s = line.replace(MD_LINK_RE, '$1')
  s = s.replace(/\*\*/g, '').replace(/__/g, '').replace(/`/g, '')
  return s.replace(/^[*_ ]+|[*_ ]+$/g, '')
}

/**
 * Extracts the first meaningful description line from markdown content.
 * Returns null if none found (no content, all headings/badges/etc.).
 */
export function extract(markdown: string): string | null {
  let inFence = false
  let inFrontmatter = false
  let seenContent = false

  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\r$/, '').trim()

    // YAML frontmatter
    if (line === '---' && !seenContent && !inFrontmatter) {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false
      continue
    }

    if (line.startsWith('```')) {
      inFence = !inFence
      seenContent = true
      continue
    }
    if (inFence) continue
    if (line.length === 0) continue

    seenContent = true
    if (line.startsWith('#')) continue
    if (line.startsWith('![') || line.startsWith('[![')) continue
    if (line.startsWith('<')) continue
    if (line.startsWith('>')) continue
    if (line === '---' || line === '***' || line === '___') continue

    const text = stripInline(line)
    if (text.length === 0) continue
    return text.length <= MAX_LENGTH ? text : text.slice(0, MAX_LENGTH).trimEnd() + '…'
  }
  return null
}

/**
 * Returns the first description found in readmeContent then claudeMdContent,
 * or "" when neither yields a result.
 */
export function getDescription(readmeContent: string | null, claudeMdContent: string | null): string {
  for (const content of [readmeContent, claudeMdContent]) {
    if (content !== null) {
      const desc = extract(content)
      if (desc) return desc
    }
  }
  return ''
}
