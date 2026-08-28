import { z } from 'zod'

import { makeParsers } from './_shared.js'

export const songTagSchema = z
  .preprocess(
    (v) => (v !== null && typeof v === 'object' ? v : {}),
    z.object({
      id: z.number().catch(0),
      name: z.string().catch(''),
      color: z.string().catch(''),
      song_count: z.number().catch(0),
      cover_url: z.string().catch(''),
      created_at: z.string().catch(''),
    }),
  )
  .transform((raw) => ({
    id: raw.id,
    name: raw.name,
    color: raw.color,
    songCount: raw.song_count,
    coverUrl: raw.cover_url,
    createdAt: raw.created_at,
  }))

export type SongTag = z.output<typeof songTagSchema>

export const songTagListResponseSchema = z
  .preprocess(
    (v) => (v !== null && typeof v === 'object' ? v : {}),
    z.object({
      tags: z.array(songTagSchema).catch([]),
      total: z.number().catch(0),
    }),
  )

export type SongTagListResponse = z.output<typeof songTagListResponseSchema>

export const fromPlaylistResultSchema = z
  .preprocess(
    (v) => (v !== null && typeof v === 'object' ? v : {}),
    z.object({
      tag: songTagSchema,
      bound: z.number().catch(0),
    }),
  )

export type FromPlaylistResult = z.output<typeof fromPlaylistResultSchema>

const songTagParsers = makeParsers(songTagSchema)
export const parseSongTag = songTagParsers.parse

const songTagListParsers = makeParsers(songTagListResponseSchema)
export const parseSongTagListResponse = songTagListParsers.parse

const fromPlaylistParsers = makeParsers(fromPlaylistResultSchema)
export const parseFromPlaylistResult = fromPlaylistParsers.parse

export function parseSongTagArray(data: unknown): SongTag[] {
  if (!Array.isArray(data)) return []
  return data.map((item) => songTagSchema.parse(item))
}
