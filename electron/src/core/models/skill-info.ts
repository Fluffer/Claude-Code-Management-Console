/** A Claude skill discovered in <project>/.claude/skills/*\/SKILL.md. */
export interface SkillInfo {
  /** Skill name: frontmatter `name`, falling back to the directory name. */
  name: string
  /** `description:` frontmatter value, or null when absent. */
  description: string | null
}
