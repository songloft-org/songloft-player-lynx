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
  /** This row is one of the selected ones — see `SongRowProps.isSelected`. */
  isSelected?: boolean
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
 * `FavoriteSongRow`), and forwards the row's menu / add-to-playlist intents to
 * the global overlays (`SongRowOverlays` in the root route). The overlays cannot
 * render here: this row lives inside a virtualized `<list-item>`, whose paint
 * containment clips and re-anchors any `position: fixed` child — see
 * `song-row-overlays.ts`.
 *
 * Responsive: narrow rows end with a single `more` button (plus the favorite
 * heart and long-press as the other entry points); wide rows (>= tablet, per
 * `useLibraryViewport`) additionally show the high-frequency "add to playlist"
 * shortcut — detail, delete, and other actions stay in the `⋯` menu.
 */
export function SongListRow({
  song,
  index,
  onTap,
  selectionMode = false,
  isSelected = false,
  subtitleSuffix,
  onOpenMenu,
}: SongListRowProps) {
  const openMenu = useSongRowOverlays((s) => s.openMenu)
  const openAddToPlaylist = useSongRowOverlays((s) => s.openAddToPlaylist)
  const { anchorId, measure } = useTapAnchor()
  const { isWide } = useLibraryViewport()
  const { isFavorite, toggle } = useFavoriteToggle(song.id)
  const currentSongId = usePlayerStore((s) => s.currentSong?.id)

  // Both entry points (the `⋯` button and long-press) anchor on the `⋯` button.
  const openMenuAnchored = (target: Song) => measure((rect) => {
    if (onOpenMenu) onOpenMenu(target, rect)
    else openMenu({ song: target, anchor: rect, row: { isWide } })
  })

  // Wide rows: one shortcut — "add to playlist" (the highest-frequency action).
  // Info, delete, and everything else stay in the `⋯` menu.
  const wideActions = !selectionMode && isWide
    ? (
      <view className='song-row__actions'>
        <view
          className='song-row__action'
          bindtap={() => openAddToPlaylist({ songIds: [song.id] })}
          data-testid='song-row-add'
        >
          <Icon name='music' size={16} color={ICON_COLORS.contentMuted} />
        </view>
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
      isSelected={isSelected}
      isWide={isWide}
      trailing={wideActions}
      subtitleSuffix={subtitleSuffix}
      onMore={selectionMode ? undefined : openMenuAnchored}
      moreAnchorId={anchorId}
    />
  )
}
