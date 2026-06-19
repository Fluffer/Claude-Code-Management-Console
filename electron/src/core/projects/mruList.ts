/** Pure most-recently-used list ops: dedup (case-insensitive), move-to-front, cap. */
export function mruAdd(existing: string[], item: string, cap: number): string[] {
  const result: string[] = [item]
  for (const e of existing) {
    if (e.toLowerCase() !== item.toLowerCase()) {
      result.push(e)
    }
  }
  return result.length > cap ? result.slice(0, cap) : result
}
