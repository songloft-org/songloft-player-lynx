/**
 * Remember that `/player` was showing the lyrics screen when the user opened
 * `/player/lyrics/adjust`. That page is a real route, so FullPlayerPage unmounts
 * and its local swiperIndex resets to 0 (cover); on return the user used to land
 * on the cover instead of the lyrics screen they came from.
 *
 * Module state, like the settings pane's remembered sub-page: a route change is
 * the only thing that clears it, and this is a one-shot restore.
 */
let returnToLyrics = false

export function markLyricsScreenBeforeAdjust(): void {
  returnToLyrics = true
}

export function consumeLyricsScreenReturn(): boolean {
  const value = returnToLyrics
  returnToLyrics = false
  return value
}
