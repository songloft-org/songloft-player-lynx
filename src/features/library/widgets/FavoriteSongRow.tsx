import type { Song } from '../../../models/song.js'
import { useFavoriteToggle } from '../data/favorites.js'
import { SongRow } from './SongRow.js'

export interface FavoriteSongRowProps {
  song: Song
  index: number
  onTap?: (song: Song, index: number) => void
}

export function FavoriteSongRow({ song, index, onTap }: FavoriteSongRowProps) {
  const { isFavorite, toggle } = useFavoriteToggle(song.id)
  return (
    <SongRow
      song={song}
      index={index}
      onTap={onTap}
      isFavorite={isFavorite}
      onToggleFavorite={toggle}
    />
  )
}
