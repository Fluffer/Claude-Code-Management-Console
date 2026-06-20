/**
 * Composes a LaunchProfile into a flag string that areFlagsSafe() accepts.
 * Pure — no process/fs access. Direct port of C# ProfileComposer.
 */

import type { LaunchProfile } from '../models'
import { areFlagsSafe } from './launchCommandBuilder'

function guard(token: string): void {
  if (token.includes(' ') || !areFlagsSafe(token)) {
    throw new Error(
      `Profile contains a token that is unsafe as a launcher flag: '${token}'. ` +
      'Use plain tool names (Read, Edit, Bash); scoped specs like Bash(git:*) are not supported.'
    )
  }
}

function appendValue(parts: string[], flag: string, value: string | null | undefined): void {
  if (value == null || value.trim().length === 0) return
  guard(value.trim())
  parts.push(flag + ' ' + value.trim())
}

function appendList(parts: string[], flag: string, tokens: readonly string[]): void {
  const clean = tokens.map(t => t.trim()).filter(t => t.length > 0)
  if (clean.length === 0) return
  for (const t of clean) guard(t)
  parts.push(flag + ' ' + clean.join(' '))
}

/**
 * Composes a LaunchProfile into a space-separated flag string suitable for
 * passing to BuildClaudeCommand as the `flags` argument.
 *
 * Order: --model, --permission-mode, --allowedTools, --disallowedTools
 * (stable order matches C# implementation for round-trip predictability).
 */
export function composeProfile(profile: LaunchProfile): string {
  const parts: string[] = []
  appendValue(parts, '--model', profile.model)
  appendValue(parts, '--permission-mode', profile.permissionMode)
  appendList(parts, '--allowedTools', profile.allowedTools)
  appendList(parts, '--disallowedTools', profile.disallowedTools)
  return parts.join(' ')
}
