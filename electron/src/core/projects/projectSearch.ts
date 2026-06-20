import type { ProjectInfo } from '../models'

/** Search-box matching: case-insensitive substring on name or description. */
export function projectMatches(project: ProjectInfo, term: string): boolean {
  return (
    project.name.toLowerCase().includes(term.toLowerCase()) ||
    project.description.toLowerCase().includes(term.toLowerCase())
  )
}
