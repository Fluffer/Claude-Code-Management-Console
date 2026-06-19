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
