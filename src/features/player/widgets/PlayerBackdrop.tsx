import './PlayerBackdrop.css'

export interface PlayerBackdropProps {
  /**
   * Already-resolved cover URL, or `''`/undefined for none.
   *
   * Deliberately the **same** URL string the cover art renders, not a smaller
   * variant. Blur makes resolution irrelevant, and an identical URL is served from
   * the image cache the cover already populated — so the backdrop costs no request at
   * all. (Flutter fetches a separate 50px thumbnail here, which is a second round
   * trip it pays for a picture nobody can resolve.)
   */
  coverUrl?: string
}

/**
 * The full player's background: the cover blurred to a wash, under a veil in the
 * canvas colour.
 *
 * Ported from the Flutter player's layered background, minus the colour. Flutter
 * extracts a palette from the cover and tints its gradients with it; Lynx has no
 * canvas and no pixel access, and the backend exposes no colour field, so there is
 * nothing to extract from. The veil is therefore a fixed canvas-coloured gradient —
 * which also means everything above it keeps using the ordinary `--content*` tokens
 * rather than a parallel palette.
 *
 * The source view remains without a cover so Android toolbar/popover blur can
 * capture a stable background id. It contains no glass surfaces itself.
 */
export function PlayerBackdrop({ coverUrl }: PlayerBackdropProps) {
  return (
    <view className='player-backdrop' data-testid='player-backdrop' id='songloft-backdrop' flatten={false}>
      {coverUrl ? <view className='player-backdrop__vivid'>
        <image className='player-backdrop__img' src={coverUrl} mode='aspectFill' />
      </view> : null}
      <view className='player-backdrop__scrim' />
    </view>
  )
}
