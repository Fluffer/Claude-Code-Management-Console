/** Case-insensitive subsequence fuzzy match with a simple ranking score. */

/** Higher is better. null = query is not a subsequence of candidate. Empty query = 0. */
export function fuzzyScore(query: string, candidate: string): number | null {
  if (!query) return 0
  if (!candidate) return null

  let qi = 0,
    score = 0,
    streak = 0
  for (let ci = 0; ci < candidate.length && qi < query.length; ci++) {
    if (candidate[ci].toLowerCase() === query[qi].toLowerCase()) {
      score += 1 + streak * 4
      if (ci === 0 || !isLetterOrDigit(candidate[ci - 1])) {
        score += 5
      }
      streak++
      qi++
    } else {
      streak = 0
    }
  }
  return qi === query.length ? score : null
}

function isLetterOrDigit(ch: string): boolean {
  return /[a-zA-Z0-9]/.test(ch)
}

export function fuzzyRank<T>(query: string, items: T[], selector: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, selector(item)) }))
    .filter((x) => x.score !== null)
    .sort((a, b) => {
      const scoreDiff = b.score! - a.score!
      if (scoreDiff !== 0) return scoreDiff
      return selector(a.item).toLowerCase().localeCompare(selector(b.item).toLowerCase())
    })
    .map((x) => x.item)
}
