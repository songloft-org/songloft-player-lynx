import type { MenuItemSpec } from './MenuItem.js'
import type { SongMenuRowContext } from './song-row-overlays.js'

/**
 * What only the caller knows about the song the menu was opened on.
 *
 * `canWatchVideo` is computed by the caller from `canWatchVideo(song)`
 * (`features/player/data/video-open.ts`) rather than read here, so this module stays a
 * pure function of its arguments — its tests drive the item set directly, with no
 * native bag and no platform stub.
 */
export interface SongMenuOptions {
  /** Offer "watch MV" — a video song on a host that can draw the picture. */
  canWatchVideo?: boolean
}

/**
 * The song menu's items, pruned by the opening row's viewport snapshot.
 *
 * Narrow rows render no shortcut buttons, so the menu carries all six items.
 * Wide rows flatten only "add-to-playlist" into a row-tail button — the
 * highest-frequency action — and the menu prunes just that one. Info, delete,
 * and the rest always appear in the menu regardless of viewport width.
 *
 * A null row (non-row callers, e.g. e2e) gets the full narrow-screen set.
 */
export function buildSongMenuItems(
  t: (key: string) => string,
  row: SongMenuRowContext | null,
  options: SongMenuOptions = {},
): MenuItemSpec[] {
  const wide = row?.isWide === true
  return [
    { key: 'play', label: t('songMenu.play'), icon: 'play' },
    /*
     * "Watch MV" sits right after "play" — for a video song it is the sibling of
     * playing it, and the whole point is to save the trip through the full player
     * (open it, find the cover, tap the badge) that was previously the only way in.
     * Never shown for a song without a picture, nor where the host cannot draw one.
     */
    ...(options.canWatchVideo
      ? [{ key: 'video', label: t('songMenu.watchVideo'), icon: 'video' as const }]
      : []),
    { key: 'info', label: t('songMenu.info'), icon: 'info' },
    { key: 'edit', label: t('songMenu.edit'), icon: 'brush' },
    ...(wide ? [] : [{ key: 'add', label: t('songMenu.addToPlaylist'), icon: 'music' as const }]),
    { key: 'manageTags', label: t('songTag.manageTags'), icon: 'label' as const },
    { key: 'delete', label: t('songMenu.deleteSong'), icon: 'x' as const, danger: true },
  ]
}
