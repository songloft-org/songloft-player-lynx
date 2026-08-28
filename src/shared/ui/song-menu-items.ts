import type { MenuItemSpec } from './MenuItem.js'
import type { SongMenuRowContext } from './song-row-overlays.js'

/**
 * The song menu's items, pruned by the opening row's viewport snapshot — the
 * song-row counterpart of the Flutter build's split, where mobile rows have
 * only a menu and desktop rows only shortcut buttons.
 *
 * Narrow rows render no shortcut buttons, so the menu is the *only* entry for
 * info/add/delete and keeps all five items. Wide rows flatten info/add (and,
 * where `showDeleteAction` allows, delete) into row-tail buttons that dispatch
 * the exact same store actions — those three come out of the menu, leaving
 * play/edit, plus delete for the wide rows whose tail × is a *different*
 * action (the playlist detail page's "remove from playlist"). A null row
 * (non-row callers, e.g. e2e) gets the full narrow-screen set.
 *
 * Lives in its own module (not `SongRowOverlays.tsx`) so the gate test can
 * import it without pulling the whole overlay component tree — the player
 * store, the dialogs, the sheet — into the test env.
 */
export function buildSongMenuItems(
  t: (key: string) => string,
  row: SongMenuRowContext | null,
): MenuItemSpec[] {
  const wide = row?.isWide === true
  const hideDelete = wide && row.deleteShortcut === true
  return [
    { key: 'play', label: t('songMenu.play'), icon: 'play' },
    ...(wide ? [] : [{ key: 'info', label: t('songMenu.info'), icon: 'info' as const }]),
    { key: 'edit', label: t('songMenu.edit'), icon: 'brush' },
    ...(wide ? [] : [{ key: 'add', label: t('songMenu.addToPlaylist'), icon: 'music' as const }]),
    { key: 'manageTags', label: t('songTag.manageTags'), icon: 'label' as const },
    ...(hideDelete
      ? []
      : [{ key: 'delete', label: t('songMenu.deleteSong'), icon: 'x' as const, danger: true }]),
  ]
}
