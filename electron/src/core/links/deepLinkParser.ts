/** Parses ccmc://launch?project=<name-or-path>[&new=true]. Returns null on anything invalid. */

export interface DeepLink {
  action: string
  project: string
  newSession: boolean
}

export const SCHEME = 'ccmc'

function parse(uriString: string | null | undefined): DeepLink | null {
  if (!uriString || !uriString.trim()) return null

  let url: URL
  try {
    url = new URL(uriString)
  } catch {
    return null
  }

  if (url.protocol !== `${SCHEME}:`) return null

  const action = url.hostname
  if (!action) return null

  const project = url.searchParams.get('project')
  if (!project || !project.trim()) return null

  const newSession = url.searchParams.get('new')?.toLowerCase() === 'true'

  return { action, project, newSession }
}

export const deepLinkParser = { parse, SCHEME }
