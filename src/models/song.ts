import { z } from 'zod'

import { makeParsers, nowIso } from './_shared.js'

/**
 * Song model.
 *
 * The backend sends **snake_case** JSON; the model exposes **camelCase**. The
 * schema reads the wire shape and `.transform()`s it into the domain object, so
 * `Song` (the inferred output type) is already camelCase. `songToJson` performs
 * the reverse mapping for requests / persistence.
 *
 * Equality is by `id` (see `songEquals`) — matching the Flutter `Song`.
 */
export const songSchema = z
  .object({
    id: z.number(),
    type: z.enum(['local', 'remote', 'radio']).catch('local'),
    title: z.string(),
    artist: z.string().nullish(),
    album: z.string().nullish(),
    year: z.number().default(0),
    genre: z.string().nullish(),
    language: z.string().nullish(),
    style: z.string().nullish(),
    duration: z.number().default(0),
    file_path: z.string().nullish(),
    url: z.string().nullish(),
    cover_url: z.string().nullish(),
    lyric_url: z.string().nullish(),
    lyric_remote_url: z.string().nullish(),
    file_size: z.number().default(0),
    format: z.string().nullish(),
    bit_rate: z.number().default(0),
    sample_rate: z.number().default(0),
    source_url: z.string().nullish(),
    source_cover_url: z.string().nullish(),
    is_live: z.boolean().default(false),
    is_video: z.boolean().default(false),
    added_at: z.string().nullish(),
    updated_at: z.string().nullish(),
  })
  .transform((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    artist: s.artist ?? undefined,
    album: s.album ?? undefined,
    year: s.year,
    genre: s.genre ?? undefined,
    language: s.language ?? undefined,
    style: s.style ?? undefined,
    duration: s.duration,
    filePath: s.file_path ?? undefined,
    url: s.url ?? undefined,
    coverUrl: s.cover_url ?? undefined,
    lyricUrl: s.lyric_url ?? undefined,
    lyricRemoteUrl: s.lyric_remote_url ?? undefined,
    fileSize: s.file_size,
    format: s.format ?? undefined,
    bitRate: s.bit_rate,
    sampleRate: s.sample_rate,
    sourceUrl: s.source_url ?? undefined,
    sourceCoverUrl: s.source_cover_url ?? undefined,
    isLive: s.is_live,
    isVideo: s.is_video,
    addedAt: s.added_at ?? nowIso(),
    updatedAt: s.updated_at ?? nowIso(),
  }))

export type Song = z.output<typeof songSchema>

/** Wire (snake_case) representation produced by `songToJson`. */
export interface SongJson {
  id: number
  type: Song['type']
  title: string
  artist: string | null
  album: string | null
  year: number
  genre: string | null
  language: string | null
  style: string | null
  duration: number
  file_path: string | null
  url: string | null
  cover_url: string | null
  lyric_url: string | null
  lyric_remote_url: string | null
  file_size: number
  format: string | null
  bit_rate: number
  sample_rate: number
  source_url: string | null
  source_cover_url: string | null
  is_live: boolean
  is_video: boolean
  added_at: string
  updated_at: string
}

export function songToJson(song: Song): SongJson {
  return {
    id: song.id,
    type: song.type,
    title: song.title,
    artist: song.artist ?? null,
    album: song.album ?? null,
    year: song.year,
    genre: song.genre ?? null,
    language: song.language ?? null,
    style: song.style ?? null,
    duration: song.duration,
    file_path: song.filePath ?? null,
    url: song.url ?? null,
    cover_url: song.coverUrl ?? null,
    lyric_url: song.lyricUrl ?? null,
    lyric_remote_url: song.lyricRemoteUrl ?? null,
    file_size: song.fileSize,
    format: song.format ?? null,
    bit_rate: song.bitRate,
    sample_rate: song.sampleRate,
    source_url: song.sourceUrl ?? null,
    source_cover_url: song.sourceCoverUrl ?? null,
    is_live: song.isLive,
    is_video: song.isVideo,
    added_at: song.addedAt,
    updated_at: song.updatedAt,
  }
}

/** Songs are equal iff they share an `id` (Flutter `operator ==`). */
export function songEquals(a: Song, b: Song): boolean {
  return a.id === b.id
}

const songParsers = makeParsers(songSchema)
export const parseSong = songParsers.parse
export const safeParseSong = songParsers.safeParse

// ── SongFacet ──────────────────────────────────────────────────────────────

export const songFacetSchema = z
  .object({
    value: z.string().default(''),
    count: z.number().default(0),
    cover_url: z.string().default(''),
  })
  .transform((f) => ({ value: f.value, count: f.count, coverUrl: f.cover_url }))

export type SongFacet = z.output<typeof songFacetSchema>

const songFacetParsers = makeParsers(songFacetSchema)
export const parseSongFacet = songFacetParsers.parse
export const safeParseSongFacet = songFacetParsers.safeParse

// ── List / facet responses (bespoke {xxx,total} envelopes, not PaginatedResponse) ──

export const songListResponseSchema = z
  .object({
    songs: z.array(songSchema).default([]),
    total: z.number().nullish(),
  })
  .transform((r) => ({ songs: r.songs, total: r.total ?? r.songs.length }))

export type SongListResponse = z.output<typeof songListResponseSchema>

const songListParsers = makeParsers(songListResponseSchema)
export const parseSongListResponse = songListParsers.parse
export const safeParseSongListResponse = songListParsers.safeParse

export const songFacetResponseSchema = z
  .object({
    facets: z.array(songFacetSchema).default([]),
    total: z.number().nullish(),
  })
  .transform((r) => ({ facets: r.facets, total: r.total ?? r.facets.length }))

export type SongFacetResponse = z.output<typeof songFacetResponseSchema>

const songFacetResponseParsers = makeParsers(songFacetResponseSchema)
export const parseSongFacetResponse = songFacetResponseParsers.parse
export const safeParseSongFacetResponse = songFacetResponseParsers.safeParse
