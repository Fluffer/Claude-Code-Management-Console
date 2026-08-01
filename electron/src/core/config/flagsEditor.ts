/**
 * Surgical edits to a flags string for the per-row pickers. Pure — no
 * process/fs access. Direct port of C# FlagsEditor.
 */

const MODEL_FLAG = /--model\s+\S+/g
const MULTI_SPACE = /\s+/g

/**
 * Replace (or remove, when model is null/blank) the --model token.
 * Order: existing flags (minus old --model) then --model <value>.
 */
export function setModel(flags: string | null, model: string | null): string {
  let without = (flags ?? '').replace(MODEL_FLAG, '').trim()
  without = without.replace(MULTI_SPACE, ' ').trim()
  if (!model || model.trim().length === 0) return without
  return without.length === 0 ? `--model ${model}` : `${without} --model ${model}`
}

/**
 * Returns the value of the --model flag, or null if absent.
 */
export function currentModel(flags: string | null): string | null {
  const m = /--model\s+(\S+)/.exec(flags ?? '')
  return m ? m[1] : null
}

/** Matches --permission-mode in either the flag=value or flag value form. */
const PERMISSION_MODE_FLAG = /--permission-mode(\s+|=)\S+/

/**
 * Returns the value of the --permission-mode flag, or null if absent.
 */
export function currentPermissionMode(flags: string | null): string | null {
  const m = /--permission-mode(?:\s+|=)(\S+)/.exec(flags ?? '')
  return m ? m[1] : null
}

/**
 * Appends the app-wide default --permission-mode, but only when the flags do
 * not already carry one.
 *
 * Anything the user set explicitly wins: a per-project flag, or an applied
 * launch profile, both of which land in the same flags string. This only fills
 * the gap for projects that never said anything about permissions, so turning
 * the default on cannot silently override a project deliberately pinned to
 * `plan`.
 *
 * A blank or null `mode` is "no default" and leaves the flags untouched.
 */
export function withDefaultPermissionMode(
  flags: string | null,
  mode: string | null,
): string {
  const existing = (flags ?? '').trim()
  if (!mode || mode.trim().length === 0) return existing
  if (PERMISSION_MODE_FLAG.test(existing)) return existing
  const token = `--permission-mode ${mode.trim()}`
  return existing.length === 0 ? token : `${existing} ${token}`
}
