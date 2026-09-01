import { z } from 'zod'

import { makeParsers } from './_shared.js'
import { songSchema } from './song.js'

/**
 * Folder browse API — `GET /api/v1/songs/folders?path=&keyword=`
 * (backend `internal/handlers/music.go`).
 *
 * Returns the subfolders and songs at a given path within the music root.
 */

export const folderInfoSchema = z.preprocess(
  (v) => (v !== null && typeof v === 'object' ? v : {}),
  z.object({
    name: z.string().catch(''),
    path: z.string().catch(''),
    song_count: z.number().catch(0),
  }).transform((raw) => ({
    name: raw.name,
    path: raw.path,
    songCount: raw.song_count,
  })),
)

export type FolderInfo = z.output<typeof folderInfoSchema>

export const folderListResponseSchema = z.preprocess(
  (v) => (v !== null && typeof v === 'object' ? v : {}),
  z.object({
    path: z.string().catch(''),
    parent_path: z.string().catch(''),
    music_path: z.string().catch(''),
    folders: z.array(folderInfoSchema).catch([]),
    total_folders: z.number().catch(0),
    songs: z.array(songSchema).catch([]),
    total_songs: z.number().catch(0),
  }).transform((raw) => ({
    path: raw.path,
    parentPath: raw.parent_path,
    musicPath: raw.music_path,
    folders: raw.folders,
    totalFolders: raw.total_folders,
    songs: raw.songs,
    totalSongs: raw.total_songs,
  })),
)

export type FolderListResponse = z.output<typeof folderListResponseSchema>

const folderListResponseParsers = makeParsers(folderListResponseSchema)
export const parseFolderListResponse = folderListResponseParsers.parse
