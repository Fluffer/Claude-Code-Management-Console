import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { LauncherConfig, ProjectInfo } from '../../core/models'
import { getDescription } from '../../core/projects/projectDescription'

const MAX_READ_BYTES = 4096

/**
 * Reads up to MAX_READ_BYTES from a file. Returns null if the file does not
 * exist or any IO error occurs.
 */
async function readHead(filePath: string): Promise<string | null> {
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(MAX_READ_BYTES)
      const { bytesRead } = await handle.read(buf, 0, MAX_READ_BYTES, 0)
      return buf.toString('utf8', 0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    if ((err as NodeJS.ErrnoException).code === 'EACCES') return null
    return null
  }
}

/**
 * Returns the project description by reading README.md then CLAUDE.md
 * (up to 4096 bytes each), mirroring C# ProjectDescription.Get.
 */
async function getProjectDescription(projectPath: string): Promise<string> {
  const readme = await readHead(path.join(projectPath, 'README.md'))
  const claudeMd = await readHead(path.join(projectPath, 'CLAUDE.md'))
  return getDescription(readme, claudeMd)
}

/**
 * Scans all configured roots and returns ProjectInfo[] matching C# ProjectScanner.Scan:
 * - Direct subfolders only (depth-1)
 * - Skips dot-prefixed names
 * - Skips entries in config.ignore (case-insensitive)
 * - Skips full paths in config.hidden (case-insensitive)
 * - Attaches lastUsedUtc and flags from config.projects
 * - Skips roots that do not exist
 * - Symlink-aware: uses withFileTypes + lstat to detect symlinked directories
 */
export async function scanProjects(config: LauncherConfig): Promise<ProjectInfo[]> {
  const projects: ProjectInfo[] = []
  const roots = config.roots ?? []
  const ignoreSet = new Set((config.ignore ?? []).map((n) => n.toLowerCase()))
  const hiddenSet = new Set((config.hidden ?? []).map((p) => p.toLowerCase()))

  for (const root of roots) {
    let entries
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      // Root does not exist or is not accessible — skip
      continue
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (ignoreSet.has(entry.name.toLowerCase())) continue

      // Resolve symlinks: check if this entry is (or points to) a directory
      const fullPath = path.join(root, entry.name)
      let isDir = entry.isDirectory()
      if (!isDir && entry.isSymbolicLink()) {
        try {
          const stat = await fs.stat(fullPath) // follows symlink
          isDir = stat.isDirectory()
        } catch {
          continue
        }
      }
      if (!isDir) continue

      if (hiddenSet.has(fullPath.toLowerCase())) continue

      // Attach usage data from config.projects (case-insensitive key match)
      let lastUsedUtc: string | null = null
      let flags = ''
      if (config.projects) {
        const projectsLower = Object.fromEntries(
          Object.entries(config.projects).map(([k, v]) => [k.toLowerCase(), v])
        )
        const usage = projectsLower[fullPath.toLowerCase()]
        if (usage) {
          if (usage.lastUsed) {
            const parsed = new Date(usage.lastUsed)
            if (!isNaN(parsed.getTime())) {
              lastUsedUtc = parsed.toISOString()
            }
          }
          flags = usage.flags ?? ''
        }
      }

      const description = await getProjectDescription(fullPath)

      projects.push({
        name: entry.name,
        root,
        path: fullPath,
        lastUsedUtc,
        flags,
        description,
      })
    }
  }

  return projects
}
