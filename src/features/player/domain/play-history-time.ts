/**
 * Relative "when was this played" label for a play-history entry.
 *
 * Kept framework-free and injectable so it is unit-testable: `now` is a
 * parameter rather than a `Date.now()` call inside.
 *
 * Deliberately built from `getMonth()`/`getDate()` rather than
 * `toLocaleDateString`: Lynx has no `Intl`, so anything locale-aware would
 * throw in the background thread (see AGENTS §4).
 */
export interface PlayHistoryTimeLabels {
  today: string
  yesterday: string
  /** Called with the day count for 2..6 days ago. */
  daysAgo: (days: number) => string
}

const MS_PER_DAY = 86_400_000

export function playedAtLabel(
  playedAt: string,
  labels: PlayHistoryTimeLabels,
  now: Date,
): string {
  if (!playedAt) return ''
  const at = new Date(playedAt)
  if (Number.isNaN(at.getTime())) return ''

  const days = Math.floor((now.getTime() - at.getTime()) / MS_PER_DAY)
  if (days <= 0) return labels.today
  if (days === 1) return labels.yesterday
  if (days < 7) return labels.daysAgo(days)
  return `${at.getMonth() + 1}/${at.getDate()}`
}
