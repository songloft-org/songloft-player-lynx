import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseFromPlaylistResult,
  parseSongTag,
  parseSongTagArray,
  parseSongTagListResponse,
  type FromPlaylistResult,
  type SongTag,
  type SongTagListResponse,
} from '../../../models/song-tag.js'

export interface TagListParams {
  keyword?: string
  sort?: string
  order?: string
  limit?: number
  offset?: number
}

export class SongTagsApi {
  constructor(private readonly client: HttpClient) {}

  async list(params: TagListParams = {}): Promise<SongTagListResponse> {
    const query: Record<string, string | number> = {
      limit: params.limit ?? 60,
      offset: params.offset ?? 0,
    }
    if (params.keyword) query.keyword = params.keyword
    if (params.sort) query.sort = params.sort
    if (params.order) query.order = params.order
    const res = await this.client.get<unknown>(`${apiPrefix}/song-tags`, { query })
    return parseSongTagListResponse(res.data)
  }

  async create(name: string, color?: string): Promise<SongTag> {
    const body: Record<string, string> = { name }
    if (color) body.color = color
    const res = await this.client.post<unknown>(`${apiPrefix}/song-tags`, body)
    return parseSongTag(res.data)
  }

  async get(id: number): Promise<SongTag> {
    const res = await this.client.get<unknown>(`${apiPrefix}/song-tags/${id}`)
    return parseSongTag(res.data)
  }

  async update(id: number, data: { name?: string; color?: string }): Promise<void> {
    const body: Record<string, string> = {}
    if (data.name !== undefined) body.name = data.name
    if (data.color !== undefined) body.color = data.color
    await this.client.put(`${apiPrefix}/song-tags/${id}`, body)
  }

  async delete(id: number): Promise<void> {
    await this.client.delete(`${apiPrefix}/song-tags/${id}`)
  }

  async getSongs(
    tagId: number,
    page: { limit?: number; offset?: number } = {},
  ): Promise<{ songs: unknown[]; total: number }> {
    const query: Record<string, number> = {
      limit: page.limit ?? 60,
      offset: page.offset ?? 0,
    }
    const res = await this.client.get<unknown>(`${apiPrefix}/song-tags/${tagId}/songs`, { query })
    const body = (res.data ?? {}) as { songs?: unknown[]; total?: number }
    return {
      songs: Array.isArray(body.songs) ? body.songs : [],
      total: typeof body.total === 'number' ? body.total : 0,
    }
  }

  async getSongIds(tagId: number): Promise<number[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/song-tags/${tagId}/song-ids`)
    const body = (res.data ?? {}) as { ids?: unknown[] }
    const ids = Array.isArray(body.ids) ? body.ids : []
    return ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
  }

  async bind(tagId: number, songIds: number[]): Promise<number> {
    const res = await this.client.post<unknown>(
      `${apiPrefix}/song-tags/${tagId}/bind`,
      { song_ids: songIds },
    )
    const body = (res.data ?? {}) as { bound?: number }
    return typeof body.bound === 'number' ? body.bound : 0
  }

  async unbind(tagId: number, songIds: number[]): Promise<number> {
    const res = await this.client.post<unknown>(
      `${apiPrefix}/song-tags/${tagId}/unbind`,
      { song_ids: songIds },
    )
    const body = (res.data ?? {}) as { unbound?: number }
    return typeof body.unbound === 'number' ? body.unbound : 0
  }

  async getSongTags(songId: number): Promise<SongTag[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs/${songId}/song-tags`)
    const body = (res.data ?? {}) as { tags?: unknown[] }
    return parseSongTagArray(body.tags ?? res.data)
  }

  async setSongTags(songId: number, tagIds: number[]): Promise<void> {
    await this.client.put(`${apiPrefix}/songs/${songId}/song-tags`, { tag_ids: tagIds })
  }

  async fromPlaylist(playlistId: number): Promise<FromPlaylistResult> {
    const res = await this.client.post<unknown>(
      `${apiPrefix}/song-tags/from-playlist/${playlistId}`,
      {},
    )
    return parseFromPlaylistResult(res.data)
  }
}
