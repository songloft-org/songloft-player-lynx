import { describe, expect, test } from 'vitest'

import { buildSongsQuery } from '../api/songs-api.js'
import type { SongsFilters } from '../api/songs-api.js'

describe('search keyword in query params', () => {
  test('keyword is included in query when non-empty', () => {
    const filters: SongsFilters = {
      sort: 'added_at',
      order: 'desc',
      keyword: 'blue',
    }
    const q = buildSongsQuery(filters, { limit: 20, offset: 0 })
    expect(q.keyword).toBe('blue')
    expect(q.sort).toBe('added_at')
    expect(q.order).toBe('desc')
  })

  test('keyword is omitted when empty string', () => {
    const filters: SongsFilters = {
      sort: 'added_at',
      order: 'desc',
      keyword: '',
    }
    const q = buildSongsQuery(filters, { limit: 20, offset: 0 })
    expect(q).not.toHaveProperty('keyword')
  })

  test('keyword is omitted when undefined', () => {
    const filters: SongsFilters = {
      sort: 'added_at',
      order: 'desc',
    }
    const q = buildSongsQuery(filters, { limit: 20, offset: 0 })
    expect(q).not.toHaveProperty('keyword')
  })

  test('keyword with whitespace is passed through (trimming is caller responsibility)', () => {
    const filters: SongsFilters = {
      keyword: '  jazz  ',
    }
    const q = buildSongsQuery(filters)
    expect(q.keyword).toBe('  jazz  ')
  })
})

describe('sort params in query', () => {
  test('sort=added_at order=desc (recent)', () => {
    const q = buildSongsQuery({ sort: 'added_at', order: 'desc' })
    expect(q.sort).toBe('added_at')
    expect(q.order).toBe('desc')
  })

  test('sort=title order=asc', () => {
    const q = buildSongsQuery({ sort: 'title', order: 'asc' })
    expect(q.sort).toBe('title')
    expect(q.order).toBe('asc')
  })

  test('sort=artist order=asc', () => {
    const q = buildSongsQuery({ sort: 'artist', order: 'asc' })
    expect(q.sort).toBe('artist')
    expect(q.order).toBe('asc')
  })

  test('sort and order are omitted when not provided', () => {
    const q = buildSongsQuery({})
    expect(q).not.toHaveProperty('sort')
    expect(q).not.toHaveProperty('order')
  })

  test('combined search + sort params', () => {
    const filters: SongsFilters = {
      keyword: 'miles',
      sort: 'title',
      order: 'asc',
    }
    const q = buildSongsQuery(filters, { limit: 20, offset: 0 })
    expect(q.keyword).toBe('miles')
    expect(q.sort).toBe('title')
    expect(q.order).toBe('asc')
    expect(q.limit).toBe(20)
    expect(q.offset).toBe(0)
  })
})

describe('query key identity with search/sort', () => {
  test('different keyword produces different query objects', () => {
    const q1 = buildSongsQuery({ keyword: 'jazz', sort: 'title', order: 'asc' })
    const q2 = buildSongsQuery({ keyword: 'rock', sort: 'title', order: 'asc' })
    expect(q1).not.toEqual(q2)
  })

  test('different sort produces different query objects', () => {
    const q1 = buildSongsQuery({ sort: 'title', order: 'asc' })
    const q2 = buildSongsQuery({ sort: 'added_at', order: 'desc' })
    expect(q1).not.toEqual(q2)
  })
})
