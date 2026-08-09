import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { formatDuration } from '../data/format.js'

/**
 * A single song row, ported from the Flutter `SongListTile` (mobile tile):
 * cover + title + artist/album subtitle + `mm:ss` duration. Favourite /
 * multi-select / context actions from the Flutter tile are deferred to a later
 * batch (see PROGRESS). Styled entirely via LUNA tokens (no hardcoded colors).
 */
export interface SongRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
}

export function SongRow({ song, index, onTap }: SongRowProps) {
  const cover = song.coverUrl ? buildCoverUrl(song.coverUrl) : ''
  const subtitle = [song.artist, song.album].filter(Boolean).join(' · ')

  return (
    <view className='song-row' bindtap={() => onTap?.(song, index)}>
      {cover
        ? <image className='song-row__cover' src={cover} />
        : <view className='song-row__cover song-row__cover--empty' />}
      <view className='song-row__meta'>
        <text className='song-row__title'>{song.title}</text>
        {subtitle
          ? <text className='song-row__subtitle'>{subtitle}</text>
          : null}
      </view>
      <text className='song-row__duration'>{formatDuration(song.duration)}</text>
    </view>
  )
}
