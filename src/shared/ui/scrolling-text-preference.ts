import { createStore } from 'zustand/vanilla'

import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

/** Device-local preference, matching the Flutter client's key. */
export const PREF_SONG_TITLE_SCROLLING = 'song_title_scrolling_enabled'

let revision = 0
let hydration = 0
let writes: Promise<void> = Promise.resolve()

export const songTitleScrolling = createStore<{ enabled: boolean }>(() => ({ enabled: true }))

export function getSongTitleScrolling(): boolean {
  return songTitleScrolling.getState().enabled
}

export function subscribeSongTitleScrolling(listener: () => void): () => void {
  return songTitleScrolling.subscribe(listener)
}

/** Restore before auth resolves; a late read must not overwrite a user choice. */
export async function applySavedSongTitleScrolling(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  const expectedHydration = ++hydration
  const expectedRevision = revision
  let saved: string | null = null
  try {
    await writes
    saved = await storage.prefs.get(PREF_SONG_TITLE_SCROLLING)
  } catch { /* Default on when storage is unavailable. */ }
  if (expectedHydration !== hydration || expectedRevision !== revision) return
  songTitleScrolling.setState({ enabled: saved !== 'false' })
}

/** Notify every mounted title immediately and serialize best-effort writes. */
export function changeSongTitleScrolling(
  enabled: boolean,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  revision++
  songTitleScrolling.setState({ enabled })
  writes = writes.then(() => storage.prefs.set(PREF_SONG_TITLE_SCROLLING, String(enabled))).catch(() => {})
  return writes
}
