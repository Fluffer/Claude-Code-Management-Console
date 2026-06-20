/** Builds ccmc://launch deep links. Inverse of deepLinkParser. */

import { SCHEME } from './deepLinkParser'

function build(project: string, newSession: boolean = false): string {
  const uri = `${SCHEME}://launch?project=${encodeURIComponent(project)}`
  return newSession ? uri + '&new=true' : uri
}

export const deepLinkBuilder = { build }
