import type { MenuItemSpec } from './MenuItem.js'
import type { SongMenuRowContext } from './song-row-overlays.js'

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
): MenuItemSpec[] {
  const wide = row?.isWide === true
  return [
    { key: 'play', label: t('songMenu.play'), icon: 'play' },
    { key: 'info', label: t('songMenu.info'), icon: 'info' },
    { key: 'edit', label: t('songMenu.edit'), icon: 'brush' },
    ...(wide ? [] : [{ key: 'add', label: t('songMenu.addToPlaylist'), icon: 'music' as const }]),
    { key: 'manageTags', label: t('songTag.manageTags'), icon: 'label' as const },
    { key: 'delete', label: t('songMenu.deleteSong'), icon: 'x' as const, danger: true },
  ]
}
