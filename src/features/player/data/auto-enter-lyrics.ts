import { router } from '../../../router.js'
import { readAutoEnterLyrics } from '../../settings/data/settings-prefs.js'
import { usePlayerStore } from '../store/index.js'

/**
 * "打开后自动进入歌词" — the launch-time navigation half (Issue #7).
 *
 * The pref used to control only the auto-swipe inside `FullPlayerPage` — a screen
 * the user has to open by hand — so on a cold start nothing ever happened: the app
 * landed on the home tab and the swipe code never mounted. The Flutter shell
 * (`shell_layout.dart` `_scheduleAutoEnterLyrics`) navigates to the full player as
 * soon as the last song is restored and lets the player screen land on the lyrics
 * page; this is the Lynx half of that step, called from the startup chain once auth
 * has resolved and `restorePlaybackState()` has completed.
 *
 * Deliberately independent of auto-resume, like Flutter: what matters is that a song
 * was restored, not that it is playing. With nothing restored, `/player` renders the
 * "nothing playing" empty state — hijacking the launch into that is worse than
 * staying on the home tab, so no navigation happens.
 *
 * Which screen the player lands on is `FullPlayerPage`'s existing job (auto-swipe on
 * narrow, split layout shows lyrics on wide) — this module only gets the user there.
 *
 * Only the startup chain (`index.tsx`) and tests may import this module: it imports
 * the router singleton statically, and `router.tsx` imports every page — a page
 * reaching this file would close that loop (the same cycle
 * `core/navigation/route-back-action.ts` injects the router to avoid).
 */
export async function navigateAutoEnterLyricsIfNeeded(): Promise<void> {
  // Cheap synchronous gate first: no storage read when there is nothing to show.
  if (!usePlayerStore.getState().currentSong) return
  if (!(await readAutoEnterLyrics())) return
  void router.navigate({ to: '/player' })
}
