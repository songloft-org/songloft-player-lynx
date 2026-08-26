import type { Song } from '../../../models/song.js'
import { useTapAnchor } from '../../../shared/ui/anchored-overlay.js'
import type { AnchorMeasurement } from '../../../shared/ui/anchored-overlay.js'
import { useSongRowOverlays } from '../../../shared/ui/song-row-overlays.js'
import { useLibraryViewport } from '../pages/library-viewport.js'
import { useFavoriteToggle } from '../data/favorites.js'
import { usePlayerStore } from '../../player/store/index.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SongRow } from './SongRow.js'

export interface SongListRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
  /**
   * Multi-select mode: hides the favorite heart, the wide-screen shortcuts, the
   * more button and long-press — the whole row is one big checkbox (mirrors the
   * Flutter `SongListTile` `isSelectionMode` behaviour).
   */
  selectionMode?: boolean
  /**
   * Wide screens only: show the destructive "delete from library" shortcut in
   * the row tail. The playlist detail page passes `false` because its rows
   * already carry a dedicated "remove from this playlist" button and stacking
   * both deletes would be ambiguous.
   */
  showDeleteAction?: boolean
  /**
   * Forwarded to the row's subtitle tail — see `SongRowProps.subtitleSuffix`.
   * The play-history panel uses it for the entry's played-at time.
   */
  subtitleSuffix?: string
  /**
   * Takes over the row's `⋯` button and long-press instead of the global song
   * menu — for lists whose menu is context-specific rather than the shared
   * song actions. The play-history panel passes "remove this entry" this way:
   * the global menu's "delete song" (which removes it from the library) must
   * not sit one tap away there. Receives the measured `⋯` rect so the caller
   * can anchor its own menu the same way the global one does.
   */
  onOpenMenu?: (song: Song, anchor: AnchorMeasurement | null) => void
}

/**
 * The song row every song list shares — the Lynx counterpart of the Flutter
 * `SongListTile`.
 *
 * Wraps the plain `SongRow` with the favorite hook (absorbing the old
 * `FavoriteSongRow`), and forwards the row's menu / delete / detail intents to
 * the global overlays (`SongRowOverlays` in the root route). The overlays cannot
 * render here: this row lives inside a virtualized `<list-item>`, whose paint
 * containment clips and re-anchors any `position: fixed` child — see
 * `song-row-overlays.ts`.
 *
 * Because of that, anchoring the menu to the `⋯` button is this row's job: it
 * measures the button on tap and sends the rect along with the song, since the menu
 * renders in a subtree that cannot see the row. Measured **on tap** rather than on
 * mount — rows recycle and lists scroll, so a mount-time rect would be stale (see
 * `useTapAnchor`). If the host cannot measure, the menu docks to the bottom instead
 * of not opening.
 *
 * Responsive: narrow rows end with a single `more` button (plus the favorite
 * heart and long-press as the other entry points); wide rows (>= tablet, per
 * `useLibraryViewport`) additionally flatten the high-frequency actions —
 * detail, add-to-playlist, delete — into icon buttons in the row tail, and the
 * `⋯` menu prunes those same actions (see `buildSongMenuItems`): on a wide row
 * it carries only play/edit — plus delete where this row renders no delete
 * shortcut (`showDeleteAction=false`, e.g. the playlist detail page whose
 * row-tail × removes from the playlist, not the library).
 */
export function SongListRow({
  song,
  index,
  onTap,
  selectionMode = false,
  showDeleteAction = true,
  subtitleSuffix,
  onOpenMenu,
}: SongListRowProps) {
  const openMenu = useSongRowOverlays((s) => s.openMenu)
  const openInfo = useSongRowOverlays((s) => s.openInfo)
  const openAddToPlaylist = useSongRowOverlays((s) => s.openAddToPlaylist)
  const requestDelete = useSongRowOverlays((s) => s.requestDelete)
  const { anchorId, measure } = useTapAnchor()
  const { isWide } = useLibraryViewport()
  const { isFavorite, toggle } = useFavoriteToggle(song.id)
  const currentSongId = usePlayerStore((s) => s.currentSong?.id)

  // Both entry points (the `⋯` button and long-press) anchor on the `⋯` button:
  // it is the only box in the row the menu can be measured against, and on Web the
  // button is the *only* entry point anyway (web-core synthesizes no longpress).
  // `onOpenMenu` redirects both to the caller's own menu when provided. The row
  // context rides along so the global menu can prune the actions this row's own
  // tail already exposes — the menu mounts outside `LibraryViewportProvider` and
  // cannot read `isWide` itself.
  const openMenuAnchored = (target: Song) => measure((rect) => {
    if (onOpenMenu) onOpenMenu(target, rect)
    else openMenu({ song: target, anchor: rect, row: { isWide, deleteShortcut: showDeleteAction } })
  })

  const wideActions = !selectionMode && isWide
    ? (
      <view className='song-row__actions'>
        <view
          className='song-row__action'
          bindtap={() => openInfo(song)}
          data-testid='song-row-detail'
        >
          <Icon name='info' size={16} color={ICON_COLORS.contentMuted} />
        </view>
        <view
          className='song-row__action'
          bindtap={() => openAddToPlaylist({ songIds: [song.id] })}
          data-testid='song-row-add'
        >
          <Icon name='music' size={16} color={ICON_COLORS.contentMuted} />
        </view>
        {showDeleteAction
          ? (
            <view
              className='song-row__action'
              bindtap={() => requestDelete(song)}
              data-testid='song-row-delete'
            >
              <Icon name='x' size={16} color={ICON_COLORS.danger} />
            </view>
          )
          : null}
      </view>
    )
    : null

  return (
    <SongRow
      song={song}
      index={index}
      onTap={onTap}
      onLongPress={selectionMode ? undefined : openMenuAnchored}
      isFavorite={isFavorite}
      onToggleFavorite={selectionMode ? undefined : toggle}
      isCurrentSong={currentSongId === song.id}
      trailing={wideActions}
      subtitleSuffix={subtitleSuffix}
      onMore={selectionMode ? undefined : openMenuAnchored}
      moreAnchorId={anchorId}
    />
  )
}
