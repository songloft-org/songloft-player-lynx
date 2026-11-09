import { memo } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../../../models/song.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SongListRow } from '../../library/widgets/SongListRow.js'
import { useLibraryViewport } from '../../library/pages/library-viewport.js'

interface Props {
  song: Song
  index: number
  titleInitial?: string
  selectMode: boolean
  selected: boolean
  isBuiltIn: boolean
  onTap: (song: Song, index: number) => void
  onRemove: (song: Song) => void
}

/** Appending a page must only mount new rows, preserving the existing rows' effects. */
export const PlaylistDetailSongRow = memo(function PlaylistDetailSongRow({
  song,
  index,
  titleInitial,
  selectMode,
  selected,
  isBuiltIn,
  onTap,
  onRemove,
}: Props) {
  const { t } = useTranslation()
  const { isWide } = useLibraryViewport()
  return (
    <view
      className={
        selected
          ? 'playlist-detail__song-row-wrapper playlist-detail__song-row-wrapper--selected'
          : 'playlist-detail__song-row-wrapper'
      }
    >
      {selectMode ? (
        <view
          className='playlist-detail__select-box'
          bindtap={() => onTap(song, index)}
        >
          <AppCheckbox checked={selected} />
        </view>
      ) : null}
      <view className='playlist-detail__song-row-content'>
        <SongListRow
          song={song}
          index={index}
          showIndex={!selectMode}
          titleInitial={titleInitial}
          onTap={onTap}
          selectionMode={selectMode}
          isSelected={selected}
          onRemoveFromPlaylist={!isBuiltIn && !selectMode && !isWide ? onRemove : undefined}
        />
      </view>
      {!isBuiltIn && !selectMode && isWide ? (
        <view
          className='playlist-detail__remove-btn'
          bindtap={() => onRemove(song)}
          accessibility-element={true}
          accessibility-label={t('playlist.removeSong')}
          data-testid='playlist-detail-remove'
        >
          <Icon name='x' size={16} color={ICON_COLORS.contentMuted} />
        </view>
      ) : null}
    </view>
  )
})
