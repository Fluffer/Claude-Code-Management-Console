/** "just now" / "5m ago" / "3h ago" / "2d ago" / "2026-05-28". */
export function formatRelativeTime(timestampUtc: Date | null, now: Date): string {
  if (timestampUtc === null) return ''

  const spanMs = now.getTime() - timestampUtc.getTime()
  const totalMinutes = spanMs / (1000 * 60)
  const totalHours = spanMs / (1000 * 60 * 60)
  const totalDays = spanMs / (1000 * 60 * 60 * 24)

  if (totalMinutes < 1) return 'just now'
  if (totalHours < 1) return `${Math.floor(totalMinutes)}m ago`
  if (totalDays < 1) return `${Math.floor(totalHours)}h ago`
  if (totalDays < 7) return `${Math.floor(totalDays)}d ago`

  const year = timestampUtc.getFullYear()
  const month = String(timestampUtc.getMonth() + 1).padStart(2, '0')
  const day = String(timestampUtc.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
