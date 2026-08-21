import { useNavigateToSongDetail } from '../../../shared/nav/navigate-to-song-detail.js'
import type { Song } from '../../../models/song.js'
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
 * Responsive: narrow rows end with a single `more` button (plus the favorite
 * heart and long-press as the other entry points); wide rows (>= tablet, per
 * `useLibraryViewport`) additionally flatten the high-frequency actions —
 * detail, add-to-playlist, delete — into icon buttons in the row tail, leaving
 * play-next / add-to-queue behind the `more` button.
 */
export function SongListRow({
  song,
  index,
  onTap,
  selectionMode = false,
  showDeleteAction = true,
}: SongListRowProps) {
  const goToSongDetail = useNavigateToSongDetail()
  const openMenu = useSongRowOverlays((s) => s.openMenu)
  const openAddToPlaylist = useSongRowOverlays((s) => s.openAddToPlaylist)
  const requestDelete = useSongRowOverlays((s) => s.requestDelete)
  const { isWide } = useLibraryViewport()
  const { isFavorite, toggle } = useFavoriteToggle(song.id)
  const currentSongId = usePlayerStore((s) => s.currentSong?.id)

  const wideActions = !selectionMode && isWide
    ? (
      <view className='song-row__actions'>
        <view
          className='song-row__action'
          bindtap={() => goToSongDetail(song.id)}
          data-testid='song-row-detail'
        >
          <Icon name='info' size={16} color={ICON_COLORS.contentMuted} />
        </view>
        <view
          className='song-row__action'
          bindtap={() => openAddToPlaylist(song)}
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
      onLongPress={selectionMode ? undefined : (target) => openMenu(target)}
      isFavorite={isFavorite}
      onToggleFavorite={selectionMode ? undefined : toggle}
      isCurrentSong={currentSongId === song.id}
      trailing={wideActions}
      onMore={selectionMode ? undefined : (target) => openMenu(target)}
    />
  )
}
