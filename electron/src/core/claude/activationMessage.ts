/**
 * Payload protocol for the single-instance activation pipe.
 * "ACTIVATE" = bring the window forward; "LINK <uri>" = also launch the deep link.
 */

import { deepLinkParser, type DeepLink } from '../links/deepLinkParser'

const ACTIVATE = 'ACTIVATE'
const LINK_PREFIX = 'LINK '

function formatLink(uri: string): string {
  return LINK_PREFIX + uri
}

/** The deep link carried by the payload, or null for plain activation / malformed input. */
function parseLink(payload: string | null | undefined): DeepLink | null {
  if (!payload || !payload.startsWith(LINK_PREFIX)) return null
  return deepLinkParser.parse(payload.slice(LINK_PREFIX.length))
}

export const activationMessage = { ACTIVATE, formatLink, parseLink }
