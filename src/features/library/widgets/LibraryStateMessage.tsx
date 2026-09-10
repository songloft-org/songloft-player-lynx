/**
 * Shared loading / empty / error block for the library's content views.
 * Extracted from the pre-refactor `LibraryPage` so FlatSongsView /
 * FacetGridView / the page skeleton all render the same states.
 *
 * An optional action button turns an empty state from a dead end into
 * a guided next step (HIG: show people a way forward, not just the void).
 */
export function LibraryStateMessage({
  text,
  subtext,
  tone,
  actionLabel,
  onAction,
}: {
  text: string
  subtext?: string
  tone?: 'error'
  /** Label for an optional action button (e.g. "Add songs"). */
  actionLabel?: string
  /** Called when the action button is tapped. */
  onAction?: () => void
}) {
  return (
    <view className='library__state'>
      <text className={tone === 'error' ? 'library__state-text library__state-text--error' : 'library__state-text'}>
        {text}
      </text>
      {subtext ? <text className='library__state-subtext'>{subtext}</text> : null}
      {actionLabel && onAction
        ? (
          <view className='library__state-action' bindtap={onAction}>
            <text className='library__state-action-text'>{actionLabel}</text>
          </view>
        )
        : null}
    </view>
  )
}