import { describe, expect, test } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import { cacheLyric, getCachedLyric, type CachedLyric } from '../data/lyric-cache.js'

describe('lyric-cache', () => {
  describe('getCachedLyric', () => {
    test('returns null when no cache exists', async () => {
      const storage = createMemoryStorage()
      const result = await getCachedLyric(42, storage)
      expect(result).toBeNull()
    })

    test('returns cached data after cacheLyric writes it', async () => {
      const storage = createMemoryStorage()
      const data: CachedLyric = {
        lyric: '[00:01.00]Hello',
        tlyric: '[00:01.00]你好',
        rlyric: '[00:01.00]Nǐ hǎo',
        lxlyric: undefined,
        cachedAt: 1000,
      }
      await cacheLyric(123, data, storage)
      const result = await getCachedLyric(123, storage)
      expect(result).toEqual(data)
    })

    test('different songIds do not collide', async () => {
      const storage = createMemoryStorage()
      const data1: CachedLyric = { lyric: 'aaa', cachedAt: 1 }
      const data2: CachedLyric = { lyric: 'bbb', cachedAt: 2 }
      await cacheLyric(1, data1, storage)
      await cacheLyric(2, data2, storage)
      expect(await getCachedLyric(1, storage)).toEqual(data1)
      expect(await getCachedLyric(2, storage)).toEqual(data2)
    })

    test('returns null gracefully when stored value is invalid JSON', async () => {
      const storage = createMemoryStorage()
      await storage.prefs.set('lyric_99', 'not-json{{{')
      const result = await getCachedLyric(99, storage)
      expect(result).toBeNull()
    })

    test('returns null when storage.prefs.get throws', async () => {
      const storage = createMemoryStorage()
      storage.prefs.get = () => { throw new Error('disk error') }
      const result = await getCachedLyric(1, storage)
      expect(result).toBeNull()
    })
  })

  describe('cacheLyric', () => {
    test('writes data that is retrievable', async () => {
      const storage = createMemoryStorage()
      const data: CachedLyric = { lyric: '[00:05.00]Test', cachedAt: 500 }
      await cacheLyric(7, data, storage)
      const raw = await storage.prefs.get('lyric_7')
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!)).toEqual(data)
    })

    test('overwrites previous cache for the same songId', async () => {
      const storage = createMemoryStorage()
      await cacheLyric(10, { lyric: 'old', cachedAt: 1 }, storage)
      await cacheLyric(10, { lyric: 'new', cachedAt: 2 }, storage)
      const result = await getCachedLyric(10, storage)
      expect(result!.lyric).toBe('new')
    })

    test('does not throw when storage.prefs.set throws', async () => {
      const storage = createMemoryStorage()
      storage.prefs.set = () => { throw new Error('quota exceeded') }
      await expect(
        cacheLyric(1, { lyric: 'x', cachedAt: 1 }, storage),
      ).resolves.toBeUndefined()
    })
  })
})
