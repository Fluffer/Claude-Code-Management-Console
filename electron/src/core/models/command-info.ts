/** A Claude slash command discovered in <project>/.claude/commands/*.md. */
export interface CommandInfo {
  /** Invocation name without leading slash (the file basename, sans .md). */
  name: string
  /** `description:` frontmatter value, or null when absent. */
  description: string | null
}
