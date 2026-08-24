/**
 * Absolute "when was this played" label for a play-history entry, as
 * `MM-dd HH:mm` in the device's local timezone.
 *
 * Mirrors the Flutter sheet's `DateFormat('MM-dd HH:mm').format(toLocal())` —
 * deliberately absolute: relative labels ("3 days ago") would need a pile of
 * pluralized l10n keys for little gain (see the Flutter comment on
 * `_formatPlayedAt`). It also means no `now` parameter — there is no relative
 * arithmetic left to inject one for.
 *
 * Kept framework-free so it is unit-testable.
 *
 * Built from `getMonth()`/`getDate()` rather than `toLocaleDateString`: Lynx
 * has no `Intl`, so anything locale-aware would throw in the background thread
 * (see AGENTS §4).
 */
export function formatPlayedAt(playedAt: string): string {
  if (!playedAt) return ''
  const at = new Date(playedAt)
  if (Number.isNaN(at.getTime())) return ''

  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}
