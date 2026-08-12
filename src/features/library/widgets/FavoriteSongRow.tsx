import type { Song } from '../../../models/song.js'
import { useFavoriteToggle } from '../data/favorites.js'
import { SongRow } from './SongRow.js'

export interface FavoriteSongRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
  onLongPress?: (song: Song) => void
}

export function FavoriteSongRow({ song, index, onTap, onLongPress }: FavoriteSongRowProps) {
  const { isFavorite, toggle } = useFavoriteToggle(song.id)
  return (
    <SongRow
      song={song}
      index={index}
      onTap={onTap}
      onLongPress={onLongPress}
      isFavorite={isFavorite}
      onToggleFavorite={toggle}
    />
  )
}
