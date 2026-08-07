import { z } from 'zod'

import { defaultPageSize } from '../core/config/constants.js'
import { makeParsers } from './_shared.js'

/**
 * Pagination request parameters. Mirrors the Flutter `PaginationParams`.
 * `limit`/`offset` default to 20/0.
 */
export class PaginationParams {
  readonly limit: number
  readonly offset: number

  constructor(params: { limit?: number; offset?: number } = {}) {
    this.limit = params.limit ?? defaultPageSize
    this.offset = params.offset ?? 0
  }

  /** As string query params, ready to append to a request. */
  toQueryParams(): Record<string, string> {
    return { limit: String(this.limit), offset: String(this.offset) }
  }

  /** Params for the next page. */
  nextPage(): PaginationParams {
    return new PaginationParams({ limit: this.limit, offset: this.offset + this.limit })
  }

  /** Params for the previous page, or `null` at the start. */
  previousPage(): PaginationParams | null {
    if (this.offset <= 0) return null
    const offset = Math.max(0, this.offset - this.limit)
    return new PaginationParams({ limit: this.limit, offset })
  }

  /** Params for a zero-based page index. */
  page(pageIndex: number): PaginationParams {
    return new PaginationParams({ limit: this.limit, offset: pageIndex * this.limit })
  }

  /** Zero-based current page. */
  get currentPage(): number {
    return Math.floor(this.offset / this.limit)
  }
}

/**
 * Generic paginated envelope `{ items, total, offset, limit }`. Note the
 * bespoke Song/Playlist list responses use `{ songs|playlists, total }` and do
 * NOT wrap this — see those models.
 */
export class PaginatedResponse<T> {
  readonly items: readonly T[]
  readonly total: number
  readonly offset: number
  readonly limit: number

  constructor(params: {
    items: readonly T[]
    total: number
    offset?: number
    limit?: number
  }) {
    this.items = params.items
    this.total = params.total
    this.offset = params.offset ?? 0
    this.limit = params.limit ?? defaultPageSize
  }

  /** More pages remain after this one (used for infinite scroll). */
  get hasMore(): boolean {
    return this.offset + this.items.length < this.total
  }

  get isEmpty(): boolean {
    return this.items.length === 0
  }

  get currentPage(): number {
    return Math.floor(this.offset / this.limit)
  }

  get totalPages(): number {
    return Math.ceil(this.total / this.limit)
  }

  /** Next-page request params, or `null` when exhausted. */
  nextPageParams(): PaginationParams | null {
    if (!this.hasMore) return null
    return new PaginationParams({ limit: this.limit, offset: this.offset + this.limit })
  }

  /** Append another page's items (infinite scroll). Adopts `other`'s cursor. */
  merge(other: PaginatedResponse<T>): PaginatedResponse<T> {
    return new PaginatedResponse<T>({
      items: [...this.items, ...other.items],
      total: other.total,
      offset: other.offset,
      limit: other.limit,
    })
  }

  /** Parse a wire `{ items, total, offset, limit }` envelope with a per-item parser. */
  static fromJson<T>(
    json: unknown,
    parseItem: (item: unknown) => T,
  ): PaginatedResponse<T> {
    const env = paginatedEnvelopeSchema.parse(json)
    return new PaginatedResponse<T>({
      items: env.items.map(parseItem),
      total: env.total ?? env.items.length,
      offset: env.offset,
      limit: env.limit,
    })
  }
}

/** Shape of a raw paginated envelope, before per-item parsing. */
const paginatedEnvelopeSchema = z.object({
  items: z.array(z.unknown()).default([]),
  total: z.number().nullish(),
  offset: z.number().default(0),
  limit: z.number().default(defaultPageSize),
})

export const paginatedEnvelopeParsers = makeParsers(paginatedEnvelopeSchema)
