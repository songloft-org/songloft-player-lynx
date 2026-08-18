/**
 * Shared loading / empty / error block for the library's content views.
 * Extracted from the pre-refactor `LibraryPage` so FlatSongsView /
 * FacetGridView / the page skeleton all render the same states.
 */
export function LibraryStateMessage({
  text,
  subtext,
  tone,
}: {
  text: string
  subtext?: string
  tone?: 'error'
}) {
  return (
    <view className='library__state'>
      <text className={tone === 'error' ? 'library__state-text library__state-text--error' : 'library__state-text'}>
        {text}
      </text>
      {subtext ? <text className='library__state-subtext'>{subtext}</text> : null}
    </view>
  )
}
